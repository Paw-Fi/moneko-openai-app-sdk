import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  type ListResourcesRequest,
  type ReadResourceRequest,
  type ListResourceTemplatesRequest,
  type ListToolsRequest,
  type CallToolRequest,
  type ListPromptsRequest,
  type GetPromptRequest,
} from "@modelcontextprotocol/sdk/types.js";
import {
  ASSET_BASE_URL_PLACEHOLDER,
  registerWidgets,
  type WidgetMetadata,
  type WidgetUris,
} from "./widgets/register.js";
import { getBudgetTool } from "./tools/getBudget.js";
import { setBudgetTool } from "./tools/setBudget.js";
import { saveExpenseTool } from "./tools/saveExpense.js";
import { saveIncomeTool } from "./tools/saveIncome.js";
import { listExpensesTool } from "./tools/listExpenses.js";
import { expenseSummaryTool } from "./tools/expenseSummary.js";
import { updateExpenseTool } from "./tools/updateExpense.js";
import { deleteExpenseTool } from "./tools/deleteExpense.js";
import { startAuthTool } from "./tools/startAuth.js";
import { startUpgradeTool } from "./tools/startUpgrade.js";
import { logger } from "./lib/logger.js";
import { getLastPublicBaseUrl } from "./lib/public-base-url.js";
import { parseExpenseRef } from "./lib/refs.js";
// OAuth removed for MVP

const DEFAULT_CATEGORIES = [
  "Food & Drink",
  "Groceries",
  "Transport",
  "Shopping",
  "Bills",
  "Housing",
  "Health",
  "Entertainment",
  "Travel",
  "Other",
];

const customCategoriesByActor = new Map<string, Set<string>>();
const authSessionByConversation = new Map<
  string,
  {
    accessToken: string;
    userId: string;
    createdAt: number;
  }
>();
const preferredCurrencyByConversation = new Map<string, string>();
const subscriptionByConversation = new Map<
  string,
  {
    checkedAt: number;
    subscribed: boolean;
    plan: string;
    status: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
  }
>();

function hasActiveSubscription(plan: string, status: string): boolean {
  const p = String(plan || "").toLowerCase();
  const s = String(status || "").toLowerCase();
  if (p === "lifetime")
    return s === "active" || s === "trialing" || s === "none" || s === "paid";
  return s === "active" || s === "trialing";
}

function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getIdentityKeys(
  headers: Record<string, string | undefined>,
): string[] {
  const candidates = [
    headers["openai-conversation-id"],
    headers["OpenAI-Conversation-Id"],
    headers["x-openai-conversation-id"],
    headers["X-OpenAI-Conversation-Id"],
    headers["openai-ephemeral-user-id"],
    headers["OpenAI-Ephemeral-User-Id"],
    headers["x-openai-ephemeral-user-id"],
    headers["X-OpenAI-Ephemeral-User-Id"],
    headers["mcp-session-id"],
    headers["Mcp-Session-Id"],
    headers["x-mcp-session-id"],
    headers["X-Mcp-Session-Id"],
  ];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of candidates) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function getConversationKey(
  headers: Record<string, string | undefined>,
): string {
  return getIdentityKeys(headers)[0] ?? "anonymous";
}

function hashForLog(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return createHash("sha256").update(value).digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  try {
    const normalized = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferSupabaseUrlFromEdgeBaseUrl(): string | undefined {
  const edgeBaseUrl = String(process.env.EDGE_BASE_URL || "").trim();
  if (!edgeBaseUrl) return undefined;
  const match = /^(https?:\/\/[^/]+)\/functions\/v1(?:\/.*)?$/i.exec(
    edgeBaseUrl,
  );
  return match?.[1];
}

function inferSupabaseAnonKeyFromEdgeApiKey(): string | undefined {
  // Never leak a service-role key to the widget. Only reuse EDGE_API_KEY if it looks like an anon JWT.
  const edgeApiKey = String(process.env.EDGE_API_KEY || "").trim();
  if (!edgeApiKey) return undefined;
  const payload = decodeJwtPayloadUnsafe(edgeApiKey);
  if (!payload) return undefined;
  return payload.role === "anon" ? edgeApiKey : undefined;
}

function getSupabaseConfig(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
} | null {
  const supabaseUrl =
    String(process.env.SUPABASE_URL || "").trim() ||
    inferSupabaseUrlFromEdgeBaseUrl() ||
    "";
  const supabaseAnonKey =
    String(process.env.SUPABASE_ANON_KEY || "").trim() ||
    inferSupabaseAnonKeyFromEdgeApiKey() ||
    "";
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey };
}

function getAuthSession(
  headers: Record<string, string | undefined>,
): { accessToken: string; userId: string } | null {
  const keys = getIdentityKeys(headers);
  for (const key of keys) {
    const session = authSessionByConversation.get(key);
    if (session) {
      return { accessToken: session.accessToken, userId: session.userId };
    }
  }
  // Fallback for environments that don't provide identity headers (e.g., in-memory tests).
  if (keys.length === 0) {
    const fallbackKey = getConversationKey(headers);
    const session = authSessionByConversation.get(fallbackKey);
    if (session)
      return { accessToken: session.accessToken, userId: session.userId };
  }
  return null;
}

function attachAuthHeader(
  headers: Record<string, string | undefined>,
  accessToken: string,
): Record<string, string | undefined> {
  return {
    ...headers,
    Authorization: `Bearer ${accessToken}`,
  };
}

function verifySupabaseJwtHs256(
  token: string,
  secret: string,
): { userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const headerB64 = parts[0];
  const payloadB64 = parts[1];
  const signatureB64 = parts[2];

  const data = `${headerB64}.${payloadB64}`;
  const expected = createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  try {
    const a = Buffer.from(signatureB64);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  const normalized = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const payload = JSON.parse(
      Buffer.from(padded, "base64").toString("utf8"),
    ) as any;
    const userId = typeof payload?.sub === "string" ? payload.sub : undefined;
    if (!userId) return null;
    return { userId };
  } catch {
    return null;
  }
}

function getActorKey(headers: Record<string, string | undefined>): string {
  const authed = getAuthSession(headers);
  return authed?.userId ?? getConversationKey(headers);
}

function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 40);
}

function listCategoriesFor(
  headers: Record<string, string | undefined>,
): string[] {
  const key = getActorKey(headers);
  const custom = Array.from(customCategoriesByActor.get(key) ?? []);
  const merged = new Set<string>(
    [...DEFAULT_CATEGORIES, ...custom]
      .map(normalizeCategoryName)
      .filter(Boolean),
  );
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

function addCategoryFor(
  headers: Record<string, string | undefined>,
  name: string,
): string[] {
  const key = getActorKey(headers);
  const normalized = normalizeCategoryName(name);
  if (!normalized) return listCategoriesFor(headers);
  const existing = customCategoriesByActor.get(key) ?? new Set<string>();
  existing.add(normalized);
  customCategoriesByActor.set(key, existing);
  return listCategoriesFor(headers);
}

function normalizePublicBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.replace(/\/mcp$/i, "");
}

function pickHeader(
  headers: Record<string, unknown>,
  key: string,
): string | undefined {
  const value =
    (headers[key] as unknown) ??
    (headers[key.toLowerCase()] as unknown) ??
    (headers[key.toUpperCase()] as unknown);

  const v = Array.isArray(value) ? value[value.length - 1] : value;
  if (v === undefined || v === null) return undefined;
  const s = String(v);
  return s.includes(",") ? s.split(",")[0].trim() : s.trim();
}

function resolveAssetBaseUrl(headers: Record<string, unknown>): string {
  const env = process.env.BASE_URL;
  if (env && env.trim()) return normalizePublicBaseUrl(env);

  const host =
    pickHeader(headers, "x-forwarded-host") ??
    pickHeader(headers, "x-original-host") ??
    pickHeader(headers, "x-host") ??
    pickHeader(headers, "host");
  if (!host) {
    const cached = getLastPublicBaseUrl();
    if (cached && cached.trim()) {
      return normalizePublicBaseUrl(cached);
    }
    const port = process.env.PORT ?? "8000";
    return `http://localhost:${port}`;
  }

  const protoFromProxy =
    pickHeader(headers, "x-forwarded-proto") ??
    pickHeader(headers, "x-forwarded-scheme") ??
    pickHeader(headers, "x-scheme");
  const isLocalHost =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");
  const proto = protoFromProxy ?? (isLocalHost ? "http" : "https");

  return `${proto}://${host}`;
}

function resolveWidgetDomain(headers: Record<string, unknown>): string {
  const env =
    String(process.env.WIDGET_DOMAIN || "").trim() ||
    String(process.env.BASE_URL || "").trim();
  const base = env ? normalizePublicBaseUrl(env) : resolveAssetBaseUrl(headers);
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
}

type WidgetCsp = {
  connect_domains: string[];
  resource_domains: string[];
  frame_domains?: string[];
};

function buildWidgetCsp(headers: Record<string, unknown>): WidgetCsp {
  const widgetDomain = resolveWidgetDomain(headers);
  const supabase = getSupabaseConfig();

  const connect = new Set<string>(["https://chatgpt.com", widgetDomain]);
  if (supabase?.supabaseUrl) {
    try {
      connect.add(new URL(supabase.supabaseUrl).origin);
    } catch {
      // ignore
    }
  }

  const resources = new Set<string>(["https://*.oaistatic.com", widgetDomain]);

  return {
    connect_domains: Array.from(connect),
    resource_domains: Array.from(resources),
  };
}

function widgetMeta(
  headers: Record<string, unknown>,
  templateUri: string,
): Record<string, unknown> {
  const widgetDomain = resolveWidgetDomain(headers);
  return {
    "openai/outputTemplate": templateUri,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
    "openai/widgetDomain": widgetDomain,
    "openai/widgetCSP": buildWidgetCsp(headers),
  };
}

/**
 * Create and configure the Moneko MCP server
 */
export function createMonekoServer(): Server {
  // Validate environment variables
  const edgeBaseUrl = process.env.EDGE_BASE_URL;
  const edgeApiKey = process.env.EDGE_API_KEY;

  if (!edgeBaseUrl || !edgeApiKey) {
    logger.error(
      "Missing required environment variables: EDGE_BASE_URL and EDGE_API_KEY",
    );
    throw new Error("Missing required environment variables. Check .env file.");
  }

  // OAuth removed for MVP

  const server = new Server(
    {
      name: "moneko-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    },
  );

  // Register widgets and get their URIs
  let widgets: WidgetMetadata[];
  let uris: WidgetUris;

  try {
    const result = registerWidgets();
    widgets = result.widgets;
    uris = result.uris;

    const widgetsByUri = new Map<string, WidgetMetadata>();
    widgets.forEach((widget) => {
      widgetsByUri.set(widget.uri, widget);
    });

    logger.info({ widgetCount: widgets.length }, "Registered widget resources");

    // Register resource handlers for widgets
    server.setRequestHandler(
      ListResourcesRequestSchema,
      async (request: ListResourcesRequest) => {
        const headers = ((request as any).meta?.headers ?? {}) as Record<
          string,
          unknown
        >;
        return {
          resources: widgets.map((w) => ({
            uri: w.uri,
            name: w.name,
            description: w.description,
            mimeType: "text/html+skybridge",
            _meta: widgetMeta(headers, w.uri),
          })),
        };
      },
    );

    server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest) => {
        const widget = widgetsByUri.get(request.params.uri);

        if (!widget) {
          throw new Error(`Unknown resource: ${request.params.uri}`);
        }

        const headers = ((request as any).meta?.headers ?? {}) as Record<
          string,
          unknown
        >;
        const assetBaseUrl = resolveAssetBaseUrl(headers);
        const html = widget.html.replaceAll(
          ASSET_BASE_URL_PLACEHOLDER,
          assetBaseUrl,
        );

        return {
          contents: [
            {
              uri: widget.uri,
              mimeType: "text/html+skybridge",
              text: html,
              _meta: widgetMeta(headers, widget.uri),
            },
          ],
        };
      },
    );

    server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (request: ListResourceTemplatesRequest) => {
        const headers = ((request as any).meta?.headers ?? {}) as Record<
          string,
          unknown
        >;
        return {
          resourceTemplates: widgets.map((w) => ({
            uriTemplate: w.uri,
            name: w.name,
            description: w.description,
            mimeType: "text/html+skybridge",
            _meta: widgetMeta(headers, w.uri),
          })),
        };
      },
    );
  } catch (error) {
    logger.error(
      { error },
      "Failed to load widget assets from web/dist. Falling back to inline minimal widgets.",
    );
    // Fallback: still expose widget resources with minimal inline HTML so
    // ChatGPT can render something instead of failing the run.
    uris = {
      app: "ui://widget/app.html",
      budget: "ui://widget/budget-status-card.html",
      categoryBreakdown: "ui://widget/category-breakdown.html",
      expenseTable: "ui://widget/expense-table.html",
      categories: "ui://widget/categories.html",
      auth: "ui://widget/auth.html",
      membership: "ui://widget/membership.html",
      chart: "ui://widget/chart.html",
    };

    const minimal = (rootId: string, title: string) =>
      `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{font:14px system-ui,sans-serif;margin:0;padding:12px;color:#111;background:#fff} .msg{padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa}</style><title>${title}</title></head><body><div id="${rootId}"><div class="msg">Widget assets not built. Showing fallback shell. Data: <pre id="__data__"></pre></div><script>try{var d=(window.openai&&window.openai.toolOutput)||{};document.getElementById('__data__').textContent=JSON.stringify(d,null,2)}catch{}</script></div></body></html>`;

    const fallbackWidgets: WidgetMetadata[] = [
      {
        uri: uris.app,
        name: "Moneko App",
        description: "Fallback app shell widget when assets are missing",
        html: minimal("app-shell-root", "Moneko"),
      },
      {
        uri: uris.budget,
        name: "Budget Status Card",
        description: "Fallback budget widget when assets are missing",
        html: minimal("budget-status-root", "Budget Status"),
      },
      {
        uri: uris.categoryBreakdown,
        name: "Category Breakdown",
        description:
          "Fallback category breakdown widget when assets are missing",
        html: minimal("category-breakdown-root", "Category Breakdown"),
      },
      {
        uri: uris.expenseTable,
        name: "Expense Table",
        description: "Fallback expense table widget when assets are missing",
        html: minimal("expense-table-root", "Expenses"),
      },
      {
        uri: uris.categories,
        name: "Categories",
        description: "Fallback categories widget when assets are missing",
        html: minimal("categories-root", "Categories"),
      },
      {
        uri: uris.membership,
        name: "Membership",
        description: "Fallback membership widget when assets are missing",
        html: minimal("membership-root", "Membership"),
      },
      {
        uri: uris.auth,
        name: "Sign in",
        description: "Fallback auth widget when assets are missing",
        html: minimal("auth-root", "Sign in"),
      },
      {
        uri: uris.chart,
        name: "Chart",
        description: "Fallback chart widget when assets are missing",
        html: minimal("chart-root", "Chart"),
      },
    ];

    // Even on fallback, register resource endpoints so the host can resolve
    // the templates and render the UI shell.
    const widgetsByUri = new Map<string, WidgetMetadata>();
    fallbackWidgets.forEach((w) => widgetsByUri.set(w.uri, w));

    server.setRequestHandler(
      ListResourcesRequestSchema,
      async (request: ListResourcesRequest) => {
        const headers = ((request as any).meta?.headers ?? {}) as Record<
          string,
          unknown
        >;
        return {
          resources: fallbackWidgets.map((w) => ({
            uri: w.uri,
            name: w.name,
            description: w.description,
            mimeType: "text/html+skybridge",
            _meta: widgetMeta(headers, w.uri),
          })),
        };
      },
    );

    server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest) => {
        const widget = widgetsByUri.get(request.params.uri);
        if (!widget) throw new Error(`Unknown resource: ${request.params.uri}`);
        const headers = ((request as any).meta?.headers ?? {}) as Record<
          string,
          unknown
        >;
        return {
          contents: [
            {
              uri: widget.uri,
              mimeType: "text/html+skybridge",
              text: widget.html,
              _meta: widgetMeta(headers, widget.uri),
            },
          ],
        };
      },
    );

    server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (request: ListResourceTemplatesRequest) => {
        const headers = ((request as any).meta?.headers ?? {}) as Record<
          string,
          unknown
        >;
        return {
          resourceTemplates: fallbackWidgets.map((w) => ({
            uriTemplate: w.uri,
            name: w.name,
            description: w.description,
            mimeType: "text/html+skybridge",
            _meta: widgetMeta(headers, w.uri),
          })),
        };
      },
    );
  }

  // Register all tools
  const mvpTools = [
    {
      name: "moneko.sign_in",
      title: "Sign In to Moneko",
      description:
        "Use this when the user asks to sign in, log in, register, or connect their Moneko account inside this chat. Opens the Moneko app shell with an embedded sign-in/register screen. Do not use for logging transactions or summaries.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.app,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Opening Moneko…",
        "openai/toolInvocation/invoked": "Sign-in ready.",
      },
    },
    {
      name: "moneko.set_auth_session",
      title: "Set Auth Session",
      description:
        "Internal: stores a Supabase access token for this ChatGPT conversation.",
      inputSchema: {
        type: "object",
        properties: {
          access_token: {
            type: "string",
            description: "Supabase access token (JWT).",
          },
        },
        required: ["access_token"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "moneko.clear_auth_session",
      title: "Sign Out",
      description: "Sign out from Moneko for this ChatGPT conversation.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "moneko.auth_status",
      title: "Auth Status",
      description:
        "Check whether you are signed in to Moneko for this ChatGPT conversation.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "moneko.open_app",
      title: "Open Moneko App",
      description:
        "Use this when the user wants an interactive UI (dashboard, transactions, budgets, insights). Also use after the user signs in so they can navigate the app. Renders the Moneko app shell widget.",
      inputSchema: {
        type: "object",
        properties: {
          tab: {
            type: "string",
            enum: [
              "overview",
              "transactions",
              "categories",
              "budget",
              "insights",
              "membership",
            ],
            description: "Optional initial tab to open.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.app,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Opening Moneko…",
        "openai/toolInvocation/invoked": "Moneko ready.",
      },
    },
    {
      name: "moneko.subscription_status",
      title: "Membership Status",
      description:
        "Use this when you need to check whether the user has an active Moneko subscription. If they are not subscribed, returns an upgrade/paywall widget with external checkout options.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.membership,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Checking membership…",
        "openai/toolInvocation/invoked": "Membership ready.",
      },
    },
    {
      name: "moneko.start_checkout",
      title: "Start Checkout",
      description:
        "Use this when the user chooses a plan and wants to start a free trial or subscribe. Returns a checkout URL to open externally. Do not use unless the user explicitly confirms they want to proceed to checkout.",
      inputSchema: {
        type: "object",
        properties: {
          plan: {
            type: "string",
            enum: ["plus", "lifetime"],
            description: "Selected plan.",
          },
          billingInterval: {
            type: "string",
            enum: ["monthly", "yearly"],
            description:
              "Billing interval (required for plus; ignored for lifetime).",
          },
        },
        required: ["plan"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    {
      name: "moneko.open_billing_portal",
      title: "Open Billing Portal",
      description:
        "Use this when the user wants to manage their subscription (cancel, invoices, payment method). Returns a Stripe billing portal URL to open externally.",
      inputSchema: {
        type: "object",
        properties: {
          returnUrl: {
            type: "string",
            description:
              "Optional return URL on moneko.io after managing billing.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    {
      name: "add_transaction",
      title: "Add Transaction",
      description:
        "Use this when the user wants to record spending or income (e.g., “I spent $12 on lunch”, “Got paid 2500”). Do not use for login/sign-in, membership, summaries, or charts.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["expense", "income"],
            description: "Transaction type. Default to expense if unclear.",
          },
          amount: {
            type: "number",
            description: "Amount in major units (e.g., 12.50).",
          },
          category: {
            type: "string",
            description: "Category name (e.g., Food & Drink, Groceries, Rent).",
          },
          description: {
            type: "string",
            description:
              "Optional note/merchant/description (e.g., “Starbucks latte”).",
          },
          date: {
            type: "string",
            description: "Optional date in YYYY-MM-DD. If omitted, use today.",
          },
          currency: {
            type: "string",
            description:
              "Optional ISO currency code (e.g., USD, EUR). If omitted, use preferred currency.",
          },
          household_id: {
            type: "string",
            description: "Optional household ID (advanced).",
          },
          household_name: {
            type: "string",
            description: "Optional household name (advanced).",
          },
          is_recurring: {
            type: "boolean",
            description: "Set true if recurring (e.g., monthly).",
          },
          frequency: {
            type: "string",
            description:
              "Recurring frequency hint (e.g., monthly, weekly, yearly).",
          },
        },
        required: ["type", "amount", "category"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.expenseTable,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Saving…",
        "openai/toolInvocation/invoked": "Saved.",
      },
    },
    {
      name: "log_expense",
      title: "Log Expense",
      description:
        "Use this when the user explicitly provides an expense to record (amount, currency, category, date). Do not use for login/sign-in, income, summaries, or charts.",
      inputSchema: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "Expense amount in major units (e.g., 12.34).",
          },
          currency: {
            type: "string",
            description: "ISO 4217 currency code (e.g., USD, EUR).",
            minLength: 3,
            maxLength: 3,
          },
          category: {
            type: "string",
            description: "Category name (e.g., Groceries).",
          },
          merchant: {
            type: "string",
            description: "Merchant or payee (optional).",
          },
          date: {
            type: "string",
            description: "Date (YYYY-MM-DD or ISO datetime).",
          },
          note: { type: "string", description: "Optional note." },
        },
        required: ["amount", "currency", "category", "date"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.expenseTable,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Logging your expense…",
        "openai/toolInvocation/invoked": "Expense logged.",
      },
    },
    {
      name: "list_expenses",
      title: "List Expenses",
      description:
        "Use this only when the user explicitly asks for a transaction list/ledger/recent transactions. Do not use for “this month/this week” breakdowns or totals—use get_summary instead (it renders the breakdown widget).",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["expense", "income"],
            description: "Transaction type (WhatsApp parity).",
          },
          currency: {
            type: "string",
            description: "Optional currency filter (ISO code), e.g. USD.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description: "Max number of rows (default 50).",
          },
          start_date: {
            type: "string",
            description: "Start date (YYYY-MM-DD), e.g. 2025-12-01.",
          },
          end_date: {
            type: "string",
            description: "End date (YYYY-MM-DD), e.g. 2025-12-31.",
          },
          household_id: {
            type: "string",
            description: "Optional household filter.",
          },
          household_name: {
            type: "string",
            description: "Optional household name (not used server-side).",
          },
          range: {
            type: "object",
            properties: {
              startDate: {
                type: "string",
                description: "Start date (YYYY-MM-DD), e.g. 2025-12-01.",
              },
              endDate: {
                type: "string",
                description: "End date (YYYY-MM-DD), e.g. 2025-12-31.",
              },
            },
            additionalProperties: false,
          },
          category: {
            type: "string",
            description: "Optional category filter (e.g., Groceries).",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.expenseTable,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Fetching your expenses…",
        "openai/toolInvocation/invoked": "Expenses ready.",
      },
    },
    {
      name: "set_currency",
      title: "Set Currency",
      description:
        "Use this when the user asks to change their preferred currency (e.g., “use EUR from now on”). Do not use for one-off conversions.",
      inputSchema: {
        type: "object",
        properties: {
          currency: {
            type: "string",
            minLength: 3,
            maxLength: 3,
            description: "ISO currency code (3 letters), e.g., USD, EUR, GBP.",
          },
        },
        required: ["currency"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "generate_chart_url",
      title: "Generate Chart",
      description:
        "Use this when the user explicitly asks for a chart/graph (e.g., “make a donut chart”). Do not use for plain summaries.",
      inputSchema: {
        type: "object",
        properties: {
          chart_type: {
            type: "string",
            enum: ["bar", "pie", "donut", "radar"],
            description: "Chart type.",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels (e.g., category names).",
          },
          data: {
            type: "array",
            items: { type: "number" },
            description: "Numeric values aligned to labels.",
          },
          title: { type: "string", description: "Optional title." },
        },
        required: ["chart_type", "labels", "data"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.chart,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Rendering chart…",
        "openai/toolInvocation/invoked": "Chart ready.",
      },
    },
    {
      name: "financial_insight",
      title: "Financial Insight",
      description:
        "Use this when the user asks about financial health/status/snapshot (e.g., “How am I doing this month?”). Returns a concise overview + category breakdown widget.",
      inputSchema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            description: "Optional scope hint (e.g., “month”).",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.categoryBreakdown,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Building your snapshot…",
        "openai/toolInvocation/invoked": "Snapshot ready.",
      },
    },
    {
      name: "get_summary",
      title: "Get Summary",
      description:
        "Use this when the user asks to see spending “for this month/week” or wants a breakdown by category. Returns a category breakdown widget. If range is omitted, defaults to the current month.",
      inputSchema: {
        type: "object",
        properties: {
          range: {
            type: "object",
            properties: {
              startDate: {
                type: "string",
                description:
                  "Start date (YYYY-MM-DD), e.g. 2025-12-01. Optional.",
              },
              endDate: {
                type: "string",
                description:
                  "End date (YYYY-MM-DD), e.g. 2025-12-31. Optional.",
              },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.categoryBreakdown,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Summarizing spending…",
        "openai/toolInvocation/invoked": "Summary ready.",
      },
    },
    {
      name: "create_category",
      title: "Create Category",
      description:
        "Use this when the user wants to add a new category for classifying expenses (e.g., “Add ‘Coffee’ as a category”).",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "New category name (e.g., Coffee).",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.categories,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Adding category…",
        "openai/toolInvocation/invoked": "Category added.",
      },
    },
    {
      name: "list_categories",
      title: "List Categories",
      description:
        "Use this when the user asks what categories exist or wants to pick a category. Read-only.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": uris.categories,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Loading categories…",
        "openai/toolInvocation/invoked": "Categories ready.",
      },
    },
  ];

  const tools = [
    ...mvpTools,
    getBudgetTool(uris),
    setBudgetTool(uris),
    saveExpenseTool(uris),
    saveIncomeTool(),
    listExpensesTool(uris),
    expenseSummaryTool(uris),
    updateExpenseTool(uris),
    deleteExpenseTool(uris),
    startAuthTool(),
    startUpgradeTool(),
  ];

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (request: ListToolsRequest) => {
      const headers = ((request as any).meta?.headers ?? {}) as Record<
        string,
        unknown
      >;
      const enriched = tools.map((tool) => {
        const outputTemplate = (tool as any)?._meta?.["openai/outputTemplate"];
        if (!outputTemplate) return tool;

        const base = widgetMeta(headers, String(outputTemplate));
        return {
          ...tool,
          _meta: {
            ...(tool as any)._meta,
            "openai/widgetDomain": base["openai/widgetDomain"],
            "openai/widgetCSP": base["openai/widgetCSP"],
          },
        };
      });

      return { tools: enriched };
    },
  );

  const SYSTEM_PROMPT = `You are Moneko — a friendly, proactive budgeting coach inside ChatGPT.

Your job: help users log transactions, understand where their money goes, and improve their financial health. Prefer rendering widgets (charts/tables) over long text.

CRITICAL RULES:
1) Sign-in gate: If the user is not signed in, call \`moneko.sign_in\` before reading or writing personal data.
2) Subscription gate: If the user is signed in but not subscribed, call \`moneko.subscription_status\` and guide them to start the 30-day free trial (external checkout) before using premium features.
3) Currency: Use the user’s preferred currency or the currency explicitly provided. If ambiguous, ask. Prefer symbols in prose when possible.
4) Confirmation: If a request is ambiguous (missing amount/currency/category/date/type), ask ONE short clarifying question and propose a best-guess category.
5) Income vs expense: All transactions are either \`type="expense"\` or \`type="income"\`. Default to expense if unclear.
6) Totals: When listing or summarizing, include (a) total for the range and (b) how many items are shown.
7) Recurring: If the user hints at “monthly/weekly/every…”, set \`is_recurring=true\` and include \`frequency\` (default monthly if unclear).
8) Privacy: Never show or request any internal IDs/references (expense IDs, household IDs, user IDs). If selection is needed, use date/amount/description or tell the user to use the widget controls.

DEFAULT UX:
- If the user says “show my expenses” for a period (this month/last week/etc), default to \`get_summary\` (chart + totals). Use \`list_expenses\` only if the user explicitly asks for a list/ledger/transactions.

TOOLING DISCIPLINE (Use this mapping):
- Open the full interactive UI: \`moneko.open_app\`
- Add money movement: \`add_transaction\`
- Edit/remove a transaction: open the Transactions UI (\`moneko.open_app\` tab=transactions or \`list_expenses\`) and tell the user to use the edit/delete buttons (never ask for IDs).
- Show a transaction list: \`list_expenses\`
- Show spending by category: \`get_summary\` (renders the category chart widget)
- Make a specific chart: \`generate_chart_url\` (renders a chart widget)
- “Financial health/status/snapshot”: \`financial_insight\`
- Change preferred currency: \`set_currency\`
- Budget pacing: \`moneko.get_budget\` / \`moneko.set_budget\`

COMMON USER INTENTS (answer directly, then guide next step):
- Spending clarity: “where did my money go?”, “why am I broke?”, “break down this month”
- Cut costs: subscriptions/coffee/shopping/bills — suggest 1–2 actionable ideas
- Budgets: set/adjust a daily budget and check pacing
- Income tracking: add incomes and compare net for the month

STYLE:
- Warm, concise, encouraging.
- After completing a task, ALWAYS suggest one next action (e.g., “Want a breakdown by category?”, “Set a daily budget?”, “See last 7 days?”).

LOGIN INTENT:
- If the user says "login", "log in", "sign in", "register", or "create account", call \`moneko.sign_in\` (never expense tools).
`;

  server.setRequestHandler(
    ListPromptsRequestSchema,
    async (_request: ListPromptsRequest) => {
      return {
        prompts: [
          {
            name: "moneko.system",
            description:
              "System instructions for the Moneko budgeting assistant",
            arguments: [],
          },
        ],
      };
    },
  );

  server.setRequestHandler(
    GetPromptRequestSchema,
    async (request: GetPromptRequest) => {
      if (request.params.name !== "moneko.system") {
        throw new Error(`Unknown prompt: ${request.params.name}`);
      }
      return {
        description: "System instructions for the Moneko budgeting assistant",
        messages: [
          { role: "system", content: { type: "text", text: SYSTEM_PROMPT } },
        ],
      };
    },
  );

  // Register unified tool call handler with OAuth authentication
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      const toolName = request.params.name;
      const args = request.params.arguments ?? {};
      const headers = (request as any).meta?.headers ?? {};
      const headerRecord = headers as Record<string, string | undefined>;
      const conversationKey = getConversationKey(headerRecord);
      const jwtSecret = String(process.env.SUPABASE_JWT_SECRET || "").trim();

      const supabaseConfig = getSupabaseConfig();

      const widgetMetaFor = (
        templateUri: string,
        extra?: Record<string, unknown>,
      ) => ({
        ...widgetMeta(headers as Record<string, unknown>, templateUri),
        ...(extra ?? {}),
      });

      const authWidgetResult = (text: string) => {
        if (!supabaseConfig) {
          return {
            content: [
              {
                type: "text",
                text: "Moneko sign-in is not configured on the server. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
              },
            ],
            structuredContent: { missingConfig: true },
          };
        }
        return {
          content: [{ type: "text", text }],
          structuredContent: {
            // Always route sign-in through the AppShell so we don't show duplicate login UIs.
            tab: "overview",
            authenticated: false,
            subscription: null,
            supabaseUrl: supabaseConfig.supabaseUrl,
            supabaseAnonKey: supabaseConfig.supabaseAnonKey,
          },
          _meta: widgetMetaFor(uris.app),
        };
      };

      const allowUnauthed = new Set<string>([
        "moneko.sign_in",
        "moneko.set_auth_session",
        "moneko.clear_auth_session",
        "moneko.auth_status",
        "moneko.open_app",
      ]);

      const storedSession = getAuthSession(headerRecord);
      const effectiveSession = storedSession;
      const effectiveHeaders = effectiveSession
        ? attachAuthHeader(headerRecord, effectiveSession.accessToken)
        : headerRecord;

      const withUserId = <T extends Record<string, unknown>>(
        payload: T,
      ): T & { userId?: string } => {
        if (!effectiveSession?.userId) return payload;
        return { ...payload, userId: effectiveSession.userId };
      };

      logger.info(
        {
          toolName,
          conversation: hashForLog(conversationKey),
          user: hashForLog(effectiveSession?.userId),
        },
        "Tool called",
      );

      if (!effectiveSession && !allowUnauthed.has(toolName)) {
        const prompt =
          (
            {
              log_expense: "Sign in to your Moneko account to log expenses.",
              list_expenses: "Sign in to your Moneko account to view expenses.",
              get_summary:
                "Sign in to your Moneko account to view your summary.",
              "moneko.get_budget":
                "Sign in to your Moneko account to view your budget.",
              "moneko.set_budget":
                "Sign in to your Moneko account to update your budget.",
              "moneko.save_expense":
                "Sign in to your Moneko account to save expenses.",
              "moneko.save_income":
                "Sign in to your Moneko account to save income.",
              "moneko.list_expenses":
                "Sign in to your Moneko account to view expenses.",
              "moneko.expense_summary":
                "Sign in to your Moneko account to view your summary.",
              "moneko.update_expense":
                "Sign in to your Moneko account to update expenses.",
              "moneko.delete_expense":
                "Sign in to your Moneko account to delete expenses.",
              "moneko.start_auth":
                "Sign in to your Moneko account to continue.",
              "moneko.start_upgrade":
                "Sign in to your Moneko account to continue.",
            } as Record<string, string>
          )[toolName] ?? "Sign in to your Moneko account to continue.";
        return authWidgetResult(prompt);
      }

      const membershipWidgetResult = (
        text: string,
        snapshot?: {
          plan: string;
          status: string;
          currentPeriodEnd?: string | null;
          cancelAtPeriodEnd?: boolean;
        },
      ) => {
        return {
          content: [{ type: "text", text }],
          structuredContent: {
            view:
              snapshot && hasActiveSubscription(snapshot.plan, snapshot.status)
                ? "member"
                : "paywall",
            message: text,
            subscription: snapshot
              ? {
                  plan: snapshot.plan,
                  status: snapshot.status,
                  currentPeriodEnd: snapshot.currentPeriodEnd ?? null,
                  cancelAtPeriodEnd: Boolean(snapshot.cancelAtPeriodEnd),
                }
              : null,
          },
          _meta: widgetMetaFor(uris.membership),
        };
      };

      const allowWithoutSubscription = new Set<string>([
        "moneko.open_app",
        "moneko.subscription_status",
        "moneko.start_checkout",
        "moneko.open_billing_portal",
        // keep existing upsell/claim flows available
        "moneko.start_auth",
        "moneko.start_upgrade",
      ]);

      const getSubscriptionSnapshot = async () => {
        if (!effectiveSession?.userId) return null;
        const cached = subscriptionByConversation.get(conversationKey);
        if (cached && Date.now() - cached.checkedAt < 60_000) return cached;

        const { proxyGet } = await import("./lib/proxy.js");
        let payload: any = null;
        try {
          payload = await proxyGet(
            "/get-subscription",
            { userId: effectiveSession.userId },
            effectiveHeaders,
            true,
          );
        } catch {
          // If the subscription service is unavailable (e.g., local dev misconfig),
          // treat as unsubscribed but do not fail the entire request.
          payload = { plan: "free", status: "unknown" };
        }

        const plan = String(
          payload?.subscription?.plan ?? payload?.plan ?? "free",
        );
        const status = String(
          payload?.subscription?.status ?? payload?.status ?? "none",
        );
        const currentPeriodEnd = (payload?.subscription?.current_period_end ??
          payload?.current_period_end ??
          null) as string | null;
        const cancelAtPeriodEnd = Boolean(
          payload?.subscription?.cancel_at_period_end ??
            payload?.cancel_at_period_end,
        );

        const subscribed = hasActiveSubscription(plan, status);
        const snapshot = {
          checkedAt: Date.now(),
          subscribed,
          plan,
          status,
          currentPeriodEnd,
          cancelAtPeriodEnd,
        };
        subscriptionByConversation.set(conversationKey, snapshot);
        return snapshot;
      };

      const subscriptionSnapshot = await getSubscriptionSnapshot();

      if (
        effectiveSession?.userId &&
        subscriptionSnapshot &&
        !subscriptionSnapshot.subscribed &&
        !allowWithoutSubscription.has(toolName) &&
        !allowUnauthed.has(toolName)
      ) {
        return membershipWidgetResult(
          "Start your free trial to unlock Moneko inside ChatGPT.",
          subscriptionSnapshot,
        );
      }

      // Route to appropriate tool handler
      switch (toolName) {
        case "moneko.sign_in": {
          return authWidgetResult(
            "Please sign in to your Moneko account to continue.",
          );
        }

        case "moneko.open_app": {
          const tab =
            typeof (args as any)?.tab === "string"
              ? String((args as any).tab)
              : "overview";
          return {
            content: [{ type: "text", text: "Opening Moneko…" }],
            structuredContent: {
              tab,
              authenticated: Boolean(effectiveSession?.userId),
              subscription: subscriptionSnapshot
                ? {
                    subscribed: subscriptionSnapshot.subscribed,
                    plan: subscriptionSnapshot.plan,
                    status: subscriptionSnapshot.status,
                    currentPeriodEnd:
                      subscriptionSnapshot.currentPeriodEnd ?? null,
                    cancelAtPeriodEnd: Boolean(
                      subscriptionSnapshot.cancelAtPeriodEnd,
                    ),
                  }
                : null,
              supabaseUrl: supabaseConfig?.supabaseUrl,
              supabaseAnonKey: supabaseConfig?.supabaseAnonKey,
            },
            _meta: widgetMetaFor(uris.app),
          };
        }

        case "moneko.subscription_status": {
          if (!effectiveSession?.userId) {
            return authWidgetResult(
              "Please sign in to check your membership status.",
            );
          }
          if (!subscriptionSnapshot) {
            return membershipWidgetResult(
              "Could not load membership status. Please try again.",
            );
          }
          if (subscriptionSnapshot.subscribed) {
            return membershipWidgetResult(
              "You have access to Moneko premium features.",
              subscriptionSnapshot,
            );
          }
          return membershipWidgetResult(
            "You are on the free plan. Start a free trial to unlock Moneko premium features.",
            subscriptionSnapshot,
          );
        }

        case "moneko.start_checkout": {
          const plan = String((args as any)?.plan || "").toLowerCase();
          const billingInterval = (args as any)?.billingInterval
            ? String((args as any).billingInterval).toLowerCase()
            : undefined;
          if (!["plus", "lifetime"].includes(plan)) {
            throw new Error('Invalid plan. Choose "plus" or "lifetime".');
          }

          const { proxy } = await import("./lib/proxy.js");
          const payload = await proxy(
            "/create-checkout-session",
            plan === "plus"
              ? {
                  plan: "plus",
                  billingInterval:
                    billingInterval === "yearly" ? "yearly" : "monthly",
                }
              : { plan: "lifetime" },
            effectiveHeaders,
            true,
          );

          const url =
            payload?.url || payload?.checkoutUrl || payload?.checkout_url;
          if (!url) {
            throw new Error("Failed to create checkout session.");
          }

          return {
            content: [{ type: "text", text: "Checkout link created." }],
            structuredContent: { url },
            _meta: widgetMetaFor(uris.membership),
          };
        }

        case "moneko.open_billing_portal": {
          if (!effectiveSession?.userId) {
            return authWidgetResult(
              "Please sign in to manage your subscription.",
            );
          }
          const returnUrl =
            typeof (args as any)?.returnUrl === "string"
              ? String((args as any).returnUrl)
              : undefined;
          const { proxy } = await import("./lib/proxy.js");
          const payload = await proxy(
            "/create-portal-session",
            { userId: effectiveSession.userId, returnUrl },
            effectiveHeaders,
            true,
          );

          const url = payload?.url || payload?.portalUrl;
          if (!url) {
            throw new Error("Failed to create billing portal session.");
          }

          return {
            content: [{ type: "text", text: "Billing portal link created." }],
            structuredContent: { url },
            _meta: widgetMetaFor(uris.membership),
          };
        }

        case "add_transaction": {
          const { AddTransactionInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toExpenseTablePayload } = await import("./lib/transform.js");

          const validArgs = AddTransactionInput.parse(args);

          const today = formatIsoDate(new Date());
          const date = validArgs.date ?? today;
          const currency = (
            validArgs.currency ??
            preferredCurrencyByConversation.get(conversationKey) ??
            "USD"
          ).toUpperCase();
          preferredCurrencyByConversation.set(conversationKey, currency);

          if (validArgs.type === "income") {
            await proxy(
              "/save-income",
              withUserId({
                amount: validArgs.amount,
                category: validArgs.category,
                currency,
                date,
                description: validArgs.description,
              }),
              effectiveHeaders,
              true,
            );

            return {
              content: [{ type: "text", text: "Income saved." }],
            };
          }

          const recurrence_rule = validArgs.is_recurring
            ? {
                frequency: String(
                  validArgs.frequency || "MONTHLY",
                ).toUpperCase(),
                interval: 1,
                anchor_date: date,
              }
            : undefined;

          await proxy(
            "/save-expense",
            withUserId({
              amount: validArgs.amount,
              category: validArgs.category,
              currency,
              date,
              description: validArgs.description,
              householdId: validArgs.household_id,
              isRecurring: validArgs.is_recurring,
              recurrence_rule,
            }),
            effectiveHeaders,
            true,
          );

          const listPayload = await proxy(
            "/list-expenses",
            withUserId({ limit: 50 }),
            effectiveHeaders,
            true,
          );
          const { props, expenseRefs } = toExpenseTablePayload(listPayload);
          return {
            content: [
              {
                type: "text",
                text: "Transaction saved. Here are your recent expenses.",
              },
            ],
            structuredContent: props,
            _meta: widgetMetaFor(uris.expenseTable, {
              "moneko/expenseRefs": expenseRefs,
            }),
          };
        }

        case "moneko.auth_status": {
          const authed = Boolean(effectiveSession?.userId);
          return {
            content: [
              {
                type: "text",
                text: authed ? "You are signed in." : "You are not signed in.",
              },
            ],
            structuredContent: {
              authenticated: authed,
            },
          };
        }

        case "moneko.clear_auth_session": {
          const keys = getIdentityKeys(headerRecord);
          const toClear = keys.length ? keys : [conversationKey];
          for (const key of toClear) {
            authSessionByConversation.delete(key);
            preferredCurrencyByConversation.delete(key);
            subscriptionByConversation.delete(key);
          }
          return {
            content: [{ type: "text", text: "Signed out for this chat." }],
            structuredContent: { authenticated: false },
          };
        }

        case "moneko.set_auth_session": {
          const { SetAuthSessionInput } = await import("./schemas.js");
          const validArgs = SetAuthSessionInput.parse(args);

          if (!jwtSecret) {
            throw new Error(
              "Server is missing SUPABASE_JWT_SECRET and cannot verify sign-in.",
            );
          }

          const verified = verifySupabaseJwtHs256(
            validArgs.access_token,
            jwtSecret,
          );
          if (!verified) {
            throw new Error("Invalid session. Please sign in again.");
          }

          const sessionRecord = {
            accessToken: validArgs.access_token,
            userId: verified.userId,
            createdAt: Date.now(),
          };

          const keys = getIdentityKeys(headerRecord);
          const toSet = keys.length ? keys : [conversationKey];
          for (const key of toSet) {
            authSessionByConversation.set(key, sessionRecord);
            subscriptionByConversation.delete(key);
          }

          return {
            content: [
              {
                type: "text",
                text: "Signed in. You can return to the chat and try again.",
              },
            ],
            structuredContent: { authenticated: true },
          };
        }

        case "log_expense": {
          const { LogExpenseInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toExpenseTablePayload } = await import("./lib/transform.js");

          const validArgs = LogExpenseInput.parse(args);

          const descriptionParts = [validArgs.merchant, validArgs.note]
            .filter(Boolean)
            .map((v) => String(v).trim())
            .filter(Boolean);
          const description = descriptionParts.length
            ? descriptionParts.join(" — ")
            : undefined;

          await proxy(
            "/save-expense",
            withUserId({
              amount: validArgs.amount,
              category: validArgs.category,
              currency: validArgs.currency,
              date: validArgs.date,
              description,
            }),
            effectiveHeaders,
            true,
          );

          const listPayload = await proxy(
            "/list-expenses",
            withUserId({ limit: 50 }),
            effectiveHeaders,
            true,
          );
          const { props, expenseRefs } = toExpenseTablePayload(listPayload);

          return {
            content: [
              {
                type: "text",
                text: "Logged that expense. Here are your most recent transactions.",
              },
            ],
            structuredContent: props,
            _meta: widgetMetaFor(uris.expenseTable, {
              "moneko/expenseRefs": expenseRefs,
            }),
          };
        }

        case "list_expenses": {
          const { ListExpensesMvpInput, ListTransactionsInput } = await import(
            "./schemas.js"
          );
          const { proxy } = await import("./lib/proxy.js");
          const { toCategoryBreakdownPayload, toExpenseTablePayload } =
            await import("./lib/transform.js");

          const parsed = (() => {
            const mvp = ListExpensesMvpInput.safeParse(args);
            if (mvp.success) return { mode: "mvp" as const, value: mvp.data };
            const parity = ListTransactionsInput.safeParse(args);
            if (parity.success)
              return { mode: "parity" as const, value: parity.data };
            throw mvp.error;
          })();

          const type =
            parsed.mode === "parity"
              ? (parsed.value.type ?? "expense")
              : "expense";
          const limit = parsed.value.limit ?? 50;
          const startDate =
            parsed.mode === "parity"
              ? parsed.value.start_date
              : parsed.value.range?.startDate;
          const endDate =
            parsed.mode === "parity"
              ? parsed.value.end_date
              : parsed.value.range?.endDate;
          const currency =
            parsed.mode === "parity" ? parsed.value.currency : undefined;

          // Default UX: if the caller provided a time window, show a chart first (category breakdown widget).
          // The widget includes a "See all transactions" action for drill-down.
          const hasWindow = Boolean(startDate || endDate);

          if (type === "expense" && hasWindow) {
            const summaryPayload = await proxy(
              "/expenses-summary",
              withUserId({ startDate, endDate, currency }),
              effectiveHeaders,
              true,
            );
            const props = toCategoryBreakdownPayload(summaryPayload);
            const sampleSize =
              (summaryPayload as any)?.data?.sampleSize ??
              (summaryPayload as any)?.sampleSize;

            return {
              content: [
                {
                  type: "text",
                  text: `Here’s your spending breakdown${typeof sampleSize === "number" ? ` (${sampleSize} items)` : ""}.`,
                },
              ],
              structuredContent: props,
              _meta: widgetMetaFor(uris.categoryBreakdown),
            };
          }

          const payload =
            type === "income"
              ? await proxy(
                  "/list-income",
                  withUserId({ startDate, endDate, limit, currency }),
                  effectiveHeaders,
                  true,
                )
              : await proxy(
                  "/list-expenses",
                  withUserId({ startDate, endDate, limit, currency }),
                  effectiveHeaders,
                  true,
                );
          const { props, expenseRefs } = toExpenseTablePayload(payload);

          const categoryFilter =
            parsed.mode === "mvp" ? parsed.value.category?.trim() : undefined;
          const filtered = categoryFilter
            ? props.rows.reduce(
                (
                  acc: { rows: any[]; refs: Array<string | null> },
                  row: any,
                  index: number,
                ) => {
                  if (
                    String(row.category || "").toLowerCase() !==
                    categoryFilter.toLowerCase()
                  )
                    return acc;
                  acc.rows.push(row);
                  acc.refs.push(expenseRefs[index] ?? null);
                  return acc;
                },
                { rows: [], refs: [] },
              )
            : null;
          const filteredProps = filtered
            ? { ...props, rows: filtered.rows }
            : props;
          const filteredRefs = filtered ? filtered.refs : expenseRefs;

          return {
            content: [{ type: "text", text: "Here are your expenses." }],
            structuredContent: filteredProps,
            _meta: widgetMetaFor(uris.expenseTable, {
              "moneko/expenseRefs": filteredRefs,
            }),
          };
        }

        case "set_currency": {
          const { SetCurrencyInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");

          const validArgs = SetCurrencyInput.parse(args);
          if (!effectiveSession?.userId) {
            return authWidgetResult(
              "Sign in to update your preferred currency.",
            );
          }

          await proxy(
            "/update-preferred-currency",
            { userId: effectiveSession.userId, currency: validArgs.currency },
            effectiveHeaders,
            true,
          );

          preferredCurrencyByConversation.set(
            conversationKey,
            validArgs.currency.toUpperCase(),
          );

          return {
            content: [
              {
                type: "text",
                text: `Preferred currency updated to ${validArgs.currency}.`,
              },
            ],
          };
        }

        case "generate_chart_url": {
          const { GenerateChartUrlInput } = await import("./schemas.js");
          const validArgs = GenerateChartUrlInput.parse(args);

          return {
            content: [{ type: "text", text: "Here’s your chart." }],
            structuredContent: {
              chart_type: validArgs.chart_type,
              labels: validArgs.labels,
              data: validArgs.data,
              title: validArgs.title,
            },
            _meta: widgetMetaFor(uris.chart),
          };
        }

        case "financial_insight": {
          const { FinancialInsightInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toBudgetStatusCard, toCategoryBreakdownPayload } =
            await import("./lib/transform.js");

          FinancialInsightInput.parse(args);

          if (!effectiveSession?.userId) {
            return authWidgetResult(
              "Sign in to your Moneko account to view your financial snapshot.",
            );
          }

          const now = new Date();
          const endDate = formatIsoDate(now);
          const monthStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
          );
          const startDate = formatIsoDate(monthStart);

          const [expenseSummary, incomeSummary, budgetStatus] =
            await Promise.all([
              proxy(
                "/expenses-summary",
                withUserId({ startDate, endDate }),
                effectiveHeaders,
                true,
              ),
              proxy(
                "/income-summary",
                withUserId({ startDate, endDate }),
                effectiveHeaders,
                true,
              ).catch((err) => ({
                success: false,
                error: err instanceof Error ? err.message : String(err),
              })),
              proxy(
                "/get-budget",
                withUserId({ date: endDate }),
                effectiveHeaders,
                true,
              ).catch(() => null),
            ]);

          const breakdownProps = toCategoryBreakdownPayload(expenseSummary);
          const breakdownList = Array.isArray((breakdownProps as any).breakdown)
            ? ((breakdownProps as any).breakdown as Array<{
                totalAmountMajor?: unknown;
                totals?: unknown;
              }>)
            : [];
          const totalSpent = breakdownList.reduce(
            (sum: number, entry) => sum + (Number(entry.totalAmountMajor) || 0),
            0,
          );

          const incomeTotal =
            incomeSummary && (incomeSummary as any).success
              ? Number(
                  (incomeSummary as any).data?.totalIncome ??
                    (incomeSummary as any).data?.mtdIncome ??
                    0,
                )
              : null;

          const net = incomeTotal === null ? null : incomeTotal - totalSpent;
          const verdict =
            net === null
              ? totalSpent > 0
                ? "Spending snapshot ready (income not tracked yet)."
                : "No spending found for this month yet."
              : net >= 0
                ? "You’re net positive this month."
                : "You’re net negative this month.";

          const primary = breakdownList[0] as any;
          const totals = Array.isArray(primary?.totals)
            ? (primary.totals as Array<any>)
            : [];
          const topCats = totals
            .slice()
            .sort(
              (a: any, b: any) =>
                (Number(b.share) || 0) - (Number(a.share) || 0),
            )
            .slice(0, 5)
            .map(
              (t: any) =>
                `${String(t.category || "Other")} ${(Number(t.share) * 100).toFixed(0)}%`,
            )
            .join(", ");

          const budgetProps = budgetStatus
            ? toBudgetStatusCard(budgetStatus)
            : null;
          const budgetLine =
            budgetProps && typeof budgetProps.remainingTodayMajor === "number"
              ? `Budget today: ${budgetProps.remainingTodayMajor.toFixed(2)} remaining (${budgetProps.currency || ""})`
              : null;

          const lines = [
            verdict,
            `Period: ${startDate} → ${endDate}`,
            incomeTotal === null ? null : `Income: ${incomeTotal.toFixed(2)}`,
            `Spending: ${totalSpent.toFixed(2)}`,
            net === null ? null : `Net: ${net.toFixed(2)}`,
            topCats ? `Top categories: ${topCats}` : null,
            budgetLine,
          ].filter(Boolean);

          return {
            content: [{ type: "text", text: lines.join("\n") }],
            structuredContent: breakdownProps,
            _meta: widgetMetaFor(uris.categoryBreakdown),
          };
        }

        case "get_summary": {
          const { GetSummaryInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toCategoryBreakdownPayload } = await import(
            "./lib/transform.js"
          );

          const validArgs = GetSummaryInput.parse(args);

          const now = new Date();
          const endDate = validArgs.range?.endDate ?? formatIsoDate(now);
          const startDate =
            validArgs.range?.startDate ??
            formatIsoDate(
              new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
            );

          const payload = await proxy(
            "/expenses-summary",
            withUserId({ startDate, endDate }),
            effectiveHeaders,
            true,
          );
          const props = toCategoryBreakdownPayload(payload);

          return {
            content: [{ type: "text", text: "Here’s your spending summary." }],
            structuredContent: props,
            _meta: widgetMetaFor(uris.categoryBreakdown),
          };
        }

        case "create_category": {
          const { CreateCategoryInput } = await import("./schemas.js");
          const validArgs = CreateCategoryInput.parse(args);

          const categories = addCategoryFor(effectiveHeaders, validArgs.name);

          return {
            content: [
              {
                type: "text",
                text: `Added category: ${normalizeCategoryName(validArgs.name)}`,
              },
            ],
            structuredContent: { categories },
            _meta: widgetMetaFor(uris.categories),
          };
        }

        case "list_categories": {
          const categories = listCategoriesFor(effectiveHeaders);

          return {
            content: [{ type: "text", text: "Here are your categories." }],
            structuredContent: { categories },
            _meta: widgetMetaFor(uris.categories),
          };
        }

        case "moneko.get_budget": {
          const { GetBudgetInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toBudgetStatusCard } = await import("./lib/transform.js");

          const validArgs = GetBudgetInput.parse(args);
          const payload = await proxy(
            "/get-budget",
            withUserId(validArgs as any),
            effectiveHeaders,
            true,
          );
          const props = toBudgetStatusCard(payload);

          return {
            content: [
              { type: "text", text: "Here's your current budget status." },
            ],
            structuredContent: props,
            _meta: widgetMetaFor(uris.budget),
          };
        }

        case "moneko.set_budget": {
          const { SetBudgetInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toBudgetStatusCard } = await import("./lib/transform.js");

          const validArgs = SetBudgetInput.parse(args);
          await proxy(
            "/set-budget",
            withUserId(validArgs as any),
            effectiveHeaders,
            true,
          );

          const budgetPayload = await proxy(
            "/get-budget",
            withUserId({ date: validArgs.date, currency: validArgs.currency }),
            effectiveHeaders,
            true,
          );
          const props = toBudgetStatusCard(budgetPayload);

          return {
            content: [
              {
                type: "text",
                text: "Budget updated successfully. Here's your new status.",
              },
            ],
            structuredContent: props,
            _meta: widgetMetaFor(uris.budget),
          };
        }

        case "moneko.save_expense": {
          const { SaveExpenseInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toBudgetStatusCard } = await import("./lib/transform.js");

          const validArgs = SaveExpenseInput.parse(args);
          await proxy(
            "/save-expense",
            withUserId(validArgs as any),
            effectiveHeaders,
            true,
          );

          const budgetPayload = await proxy(
            "/get-budget",
            withUserId({ date: validArgs.date, currency: validArgs.currency }),
            effectiveHeaders,
            true,
          );
          const props = toBudgetStatusCard(budgetPayload);

          return {
            content: [
              {
                type: "text",
                text: "Expense saved successfully. Here's your updated budget.",
              },
            ],
            structuredContent: props,
            _meta: widgetMetaFor(uris.budget),
          };
        }

        case "moneko.save_income": {
          const { SaveIncomeInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");

          const validArgs = SaveIncomeInput.parse(args);
          await proxy(
            "/save-income",
            withUserId(validArgs as any),
            effectiveHeaders,
            true,
          );

          return {
            content: [{ type: "text", text: "Income saved successfully." }],
          };
        }

        case "moneko.list_expenses": {
          const { ListExpensesInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toExpenseTablePayload } = await import("./lib/transform.js");

          const validArgs = ListExpensesInput.parse(args);
          const payload = await proxy(
            "/list-expenses",
            withUserId(validArgs as any),
            effectiveHeaders,
            true,
          );
          const { props, expenseRefs } = toExpenseTablePayload(payload);

          return {
            content: [{ type: "text", text: "Here are your expenses." }],
            structuredContent: props,
            _meta: widgetMetaFor(uris.expenseTable, {
              "moneko/expenseRefs": expenseRefs,
            }),
          };
        }

        case "moneko.expense_summary": {
          const { ExpenseSummaryInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toCategoryBreakdownPayload } = await import(
            "./lib/transform.js"
          );

          const validArgs = ExpenseSummaryInput.parse(args);
          const payload = await proxy(
            "/expenses-summary",
            withUserId(validArgs as any),
            effectiveHeaders,
            true,
          );
          const props = toCategoryBreakdownPayload(payload);

          return {
            content: [
              {
                type: "text",
                text: "Here's your spending breakdown by category.",
              },
            ],
            structuredContent: props,
            _meta: widgetMetaFor(uris.categoryBreakdown),
          };
        }

        case "moneko.update_expense": {
          const { UpdateExpenseInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toExpenseTablePayload } = await import("./lib/transform.js");

          const validArgs = UpdateExpenseInput.parse(args);
          const refreshWindow = (args as any).refreshWindow ?? {};
          const expenseId = parseExpenseRef(validArgs.expenseRef);
          if (!expenseId) {
            throw new Error(
              "Invalid expense reference. Please refresh the transactions list and try again.",
            );
          }

          await proxy(
            "/update-expense",
            withUserId({ expenseId, updates: validArgs.updates }),
            effectiveHeaders,
            true,
          );

          const listPayload = await proxy(
            "/list-expenses",
            withUserId({
              startDate: refreshWindow.startDate,
              endDate: refreshWindow.endDate,
              currency: refreshWindow.currency,
            }),
            effectiveHeaders,
            true,
          );
          const { props, expenseRefs } = toExpenseTablePayload(listPayload);

          return {
            content: [{ type: "text", text: "Expense updated successfully." }],
            structuredContent: props,
            _meta: widgetMetaFor(uris.expenseTable, {
              "moneko/expenseRefs": expenseRefs,
            }),
          };
        }

        case "moneko.delete_expense": {
          const { DeleteExpenseInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");
          const { toExpenseTablePayload } = await import("./lib/transform.js");

          const validArgs = DeleteExpenseInput.parse(args);
          const refreshWindow = (args as any).refreshWindow ?? {};

          const expenseId = parseExpenseRef(validArgs.expenseRef);
          if (!expenseId) {
            throw new Error(
              "Invalid expense reference. Please refresh the transactions list and try again.",
            );
          }

          await proxy(
            "/delete-expense",
            withUserId({ expenseIds: expenseId }),
            effectiveHeaders,
            true,
          );

          const listPayload = await proxy(
            "/list-expenses",
            withUserId({
              startDate: refreshWindow.startDate,
              endDate: refreshWindow.endDate,
              currency: refreshWindow.currency,
            }),
            effectiveHeaders,
            true,
          );
          const { props, expenseRefs } = toExpenseTablePayload(listPayload);

          return {
            content: [{ type: "text", text: "Expense deleted successfully." }],
            structuredContent: props,
            _meta: widgetMetaFor(uris.expenseTable, {
              "moneko/expenseRefs": expenseRefs,
            }),
          };
        }

        case "moneko.start_auth": {
          const { StartAuthInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");

          const validArgs = StartAuthInput.parse(args);
          const payload = await proxy(
            "/start-auth",
            withUserId(validArgs as any),
            effectiveHeaders,
            true,
          );
          const href = payload?.href || payload?.url || payload?.claimLink;

          if (!href) {
            throw new Error("Failed to generate authentication link");
          }

          return {
            content: [
              {
                type: "text",
                text: "Open this link to claim your account and save your data permanently.",
              },
            ],
            structuredContent: { href },
          };
        }

        case "moneko.start_upgrade": {
          const { StartUpgradeInput } = await import("./schemas.js");
          const { proxy } = await import("./lib/proxy.js");

          const validArgs = StartUpgradeInput.parse(args);
          const payload = await proxy(
            "/start-upgrade",
            withUserId(validArgs as any),
            effectiveHeaders,
            true,
          );
          const href = payload?.href || payload?.url || payload?.checkoutLink;

          if (!href) {
            throw new Error("Failed to generate upgrade link");
          }

          return {
            content: [
              {
                type: "text",
                text: "Open this link to upgrade and unlock proactive alerts and advanced features.",
              },
            ],
            structuredContent: { href },
          };
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    },
  );

  logger.info({ toolCount: tools.length }, "Registered MCP tool handler");

  logger.info("Created Moneko MCP server successfully");
  return server;
}
