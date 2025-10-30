Moneko Apps SDK (MCP) — Implementation Addendum

Purpose

This document defines, in engineering terms, how to ship the first version of the Moneko OpenAI App using the OpenAI Apps SDK (MCP). It covers:
	•	Required backend fixes (blockers).
	•	Exact MCP server behavior (tools, proxying, transforms).
	•	Widget runtime contract (props, CSP, bridge).
	•	Security / compliance gates.
	•	Testing gates for signoff.

This is the version that engineering should execute.

⸻

A. Mandatory backend fixes (blockers to ship)

These changes must land in our Supabase Edge function codebase before MCP integration can be considered stable. If these don’t ship, the MCP server will have to special-case weirdness and review will be harder.

1. /set-budget

Current problem:
	•	There’s an early if (!contactId) return errorResponse("Failed to resolve contact").
	•	Below that, there is logic to create/insert a missing contactId. That code is unreachable because of the early return.
	•	Result: first-time callers with just phone/OpenAI identity cannot set a budget.

Required change:
	•	Move contact creation logic before any early return.
	•	Behavior should be:
	1.	Resolve contactId via headers / phone / guest logic.
	2.	If not found, create contact (guest or phone) and continue.
	3.	Upsert budget row.
	4.	Respond.

Why:
	•	The widget in ChatGPT will call moneko.set_budget directly on first interaction. If this fails for new guests, onboarding in ChatGPT is dead on arrival.

Also:
	•	Add Accept: application/json support. When the request header Accept is application/json, return JSON object { ok, results, meta }, not only the plain text summary. The MCP server depends on structured data, not free text.

2. /list-expenses

Current problems:
	•	Supports currency in request body but does not actually filter on it in the DB query.
	•	Duplicate environment / Supabase client bootstrap blocks in the handler (messy and potentially inconsistent).

Required changes:
	•	Add optional currency filter:

if (body.currency) {
  query = query.eq("currency", validateCurrency(body.currency));
}

	•	Ensure validateCurrency() normalizes / uppercases codes.
	•	Deduplicate Supabase client creation. There should be a single createClient call per request, not “recreate in two branches.”

Why:
	•	The ExpenseTableCompact widget will display “transactions for October in EUR.” If backend ignores currency, the UI lies.
	•	OpenAI will test this with “show me my GBP expenses this week.”

3. /expenses-summary

Current behavior:
	•	For GPT callers: returns Markdown + chart link (QuickChart image).
	•	For non-GPT callers: returns structured JSON { breakdown, totalsByCurrency, timeWindow, filters, sampleSize }.
	•	May include household data (shared budgets) in totals.

Required changes:
	•	We need consistent JSON when we ask for it. Add logic:
	•	If header Accept: application/json is present, always return JSON, even if called from GPT context. Do not return the Markdown blob in that case.
	•	Add personal-only filter:
	•	When the request is coming from ChatGPT / GPT (you already detect GPT vs non-GPT via headers), exclude household rows:

if (detectGptRequest(req).isGpt) {
  query = query.is('household_id', null);
}


	•	This ensures the summary is personal-only. Do not leak household/couples data in v1.

Why:
	•	The CategoryBreakdownChart widget will hydrate entirely from the structured JSON path.
	•	We cannot show partner/couples spend accidentally; that triggers review scrutiny and complicates consent questions.

4. /analyze-expense

Current behavior:
	•	Parses either:
	•	free-form text like “€12 ramen dinner yesterday in Dublin,” or
	•	base64 receipt image info,
	•	Returns parsed candidate expense(s) but does not persist (good),
	•	Omits resolvedUserId and meta in the success response.

Required changes:
	•	Add resolvedUserId and meta to the success response for parity with other functions.

Why:
	•	Consistency and auditability. We’ll eventually expose this as a “Scan receipt → confirm?” flow in ChatGPT. We want consistent metadata for identity and debugging.

5. gpt-guests (guest identity resolver)

Current behavior:
	•	Uses Supabase admin listUsers() / scans users to find one whose metadata matches the OpenAI conversation ID.

Required changes:
	•	Switch to deterministic lookup/creation instead of scanning. Pattern:
	•	Build a deterministic synthetic identity (e.g. gpt-${conversationId}@guest.moneko).
	•	Try to fetch that explicit user/contact by this synthetic identifier.
	•	If not found, create it.
	•	Always annotate contact/user metadata with conversationId, ephemeral ID, etc.

Why:
	•	Scaling: scanning all users will not scale and can get you flagged as inefficient.
	•	Security review: it’s much easier to explain “ConversationId maps to this locked pseudo-user record” than “we iterate everyone.”

6. /get-budget + /set-budget response formats

Current behavior:
	•	Sometimes returns plain text “Your daily budget is X; you’ve spent Y.”
	•	Sometimes returns structured JSON { ok, results: { ...numbers... }, meta: { ... } }.

Required changes:
	•	Honor Accept: application/json in both /get-budget and /set-budget. If Accept is application/json, always return JSON.
	•	JSON must include at least:
	•	date
	•	currency
	•	daysInMonth
	•	dayApplied
	•	dailyBudgetCents
	•	totals.spentToDateCents
	•	totals.remainingToDateCents
	•	totals.projectedMonthRemainingCents

Why:
	•	Our MCP server will read these fields, convert cents → major units, and produce widget props. We cannot reliably parse free text for production.

Acceptance test for backend fixes

After the changes above:
	•	Calling each function with headers:
	•	OpenAI-Conversation-Id: <fake-guid>
	•	Accept: application/json
should return structured JSON that matches our OpenAPI schemas (or superset).
	•	/expenses-summary with Accept: application/json must not return Markdown.
	•	/expenses-summary when detectGptRequest(req).isGpt === true must exclude household data (household_id rows).
	•	/list-expenses actually filters by currency when provided.
	•	/set-budget successfully creates/continues for a first-time guest caller (no early-return bug).

These conditions are required before integration with the MCP server.

⸻

B. MCP Server (@moneko-openai-app-sdk/server)

This Node service is what OpenAI talks to. It registers tools, proxies to Supabase, and returns widget-ready structured data.

B.1 Tech stack
	•	Node 18+
	•	@modelcontextprotocol/sdk
	•	undici for HTTP calls to Supabase Edge
	•	zod for input validation
	•	pino for logging
	•	dotenv to load environment

Environment variables:
	•	EDGE_BASE_URL=https://budgeting.moneko.io
	•	EDGE_API_KEY=... (the same apikey currently hardcoded in our OpenAPI spec; move it here, do NOT ship in widget code)
	•	LOG_LEVEL=info
	•	PORT=8000 (or whatever runtime env uses)

B.2 File layout

@moneko-openai-app-sdk/server/
  src/
    index.ts                # HTTP + SSE bootstrap
    server.ts               # creates MCP server instance
    tools/
      saveExpense.ts
      listExpenses.ts
      expenseSummary.ts
      getBudget.ts
      setBudget.ts
      updateExpense.ts
      deleteExpense.ts
      startAuth.ts
      startUpgrade.ts
    lib/
      proxy.ts              # core proxyEdgeFunction() with header passthrough and Accept: application/json
      transform.ts          # Supabase responses --> widget props
      errors.ts             # status -> user_message mapping
      logger.ts             # pino setup
    schemas.ts              # zod validation for each tool’s input args
    widgets/
      register.ts           # registers iframe resources, returns their URIs
  package.json
  tsconfig.json
  .env.example
  README.md

B.3 Proxy layer (src/lib/proxy.ts)

Responsibilities:
	•	Send POSTs to Supabase Edge functions.
	•	Add required headers:
	•	apikey from env
	•	OpenAI-Conversation-Id / OpenAI-Ephemeral-User-Id from the incoming tool call headers.
	•	Accept: application/json for structured responses.
	•	Parse JSON or fallback to text.
	•	Normalize any non-2xx into safe, end-user-friendly errors.

Code outline (this is contract-level accurate):

import { request } from 'undici';

const base = process.env.EDGE_BASE_URL!;
const apiKey = process.env.EDGE_API_KEY!;

export async function proxy(path: string, body: unknown, incoming: Record<string, string | undefined>, acceptJson = true) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    apikey: apiKey,
  };

  // Forward identity so Supabase can resolve / create guest user
  const conv = incoming['openai-conversation-id'] ?? incoming['OpenAI-Conversation-Id'];
  const eph  = incoming['openai-ephemeral-user-id'] ?? incoming['OpenAI-Ephemeral-User-Id'];
  if (conv) headers['OpenAI-Conversation-Id'] = String(conv);
  if (eph)  headers['OpenAI-Ephemeral-User-Id'] = String(eph);

  if (acceptJson) headers['Accept'] = 'application/json';

  const res = await request(`${base}${path}`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
    headers,
  });

  const text = await res.body.text();
  const ctype = res.headers.get('content-type') || '';
  const payload = ctype.includes('application/json') ? safeParse(text) : text;

  if (res.statusCode >= 400) throw normalizeError(res.statusCode, payload);
  return payload;
}

function safeParse(s: string) {
  try { return JSON.parse(s); }
  catch { return { raw: s }; }
}

export function normalizeError(status: number, payload: any) {
  const rawMsg = typeof payload === 'string'
    ? payload
    : payload?.error ||
      payload?.message ||
      'Request failed';

  const err: any = new Error(mapUserMessage(status, rawMsg));
  err.status = status;
  err.details = payload;
  return err;
}

// This message is surfaced to the model, so keep it safe and user-facing.
function mapUserMessage(status: number, msg: string) {
  if (status === 400) return 'I couldn’t process that. Please include required fields (amount, currency, date, etc.).';
  if (status === 403) return 'You do not have permission for that item.';
  if (status === 404) return 'I couldn’t find that item.';
  if (status === 429) return 'Too many requests; please try again shortly.';
  return 'Something went wrong on our side. Try again in a minute.';
}

B.4 Input schemas (src/schemas.ts)

Every tool has its own input schema. These should match (or be a strict subset of) the shapes in docs/gpt-actions-schema.json / OpenAPI.

Important: date and currency are explicit, not inferred.

import { z } from 'zod';

export const SaveExpenseInput = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  currency: z.string().length(3),
  date: z.string().min(1),           // "YYYY-MM-DD" or ISO datetime
  clientCreatedAt: z.string().optional(),
  description: z.string().optional(),
  receiptImageUrl: z.string().url().optional(),
});

export const ListExpensesInput = z.object({
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const ExpenseSummaryInput = z.object({
  startDate: z.string().optional(),  // "lower bound"
  endDate: z.string().min(1),        // "upper bound" required
  currency: z.string().length(3).optional(),
  maxRows: z.number().int().optional(),
});

export const GetBudgetInput = z.object({
  date: z.string().min(1),           // required, we do not infer server 'today'
  currency: z.string().length(3).optional(),
  day: z.number().int().optional(),  // projection day override
});

export const SetBudgetInput = z.object({
  amount: z.number().positive(),     // major units, e.g. 25.50
  date: z.string().min(1),
  currency: z.string().length(3),
});

export const UpdateExpenseInput = z.object({
  expenseId: z.string().uuid(),
  updates: z.object({
    amount_cents: z.number().int().positive().optional(),
    category: z.string().optional(),
    raw_text: z.string().optional(),
    date: z.string().optional(),         // "YYYY-MM-DD"
    currency: z.string().length(3).optional(),
  }).refine(v => Object.keys(v).length > 0, "updates must include at least one field"),
});

export const DeleteExpenseInput = z.object({
  expenseId: z.string().uuid(),
});

B.5 Transforms (src/lib/transform.ts)

These map Supabase responses → widget props.

BudgetStatusCard transform:
	•	Input: /get-budget (JSON path)
	•	Output props:
	•	date
	•	currency
	•	dailyBudgetMajor
	•	spentToDateMajor
	•	remainingTodayMajor
	•	projectedMonthRemainingMajor
	•	daysInMonth
	•	dayApplied
	•	risk.projectedNegative: boolean (used to show upsell)
	•	guestInfo: { isGuest, canClaim }

Implementation sketch:

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function toBudgetStatusCard(result: any) {
  // Support both { ok, results, meta } and bare results
  const r = result?.results ?? result;
  const totals = r?.totals ?? {};

  const dailyBudgetCents = r?.dailyBudgetCents ?? 0;
  const spentCents = totals.spentToDateCents ?? totals.spent_cents ?? 0;
  const remainingCents = totals.remainingToDateCents ?? totals.remaining_cents ?? 0;
  const projectedCents = totals.projectedMonthRemainingCents ?? 0;

  const projectedNegative = projectedCents < 0;

  return {
    date: r?.date,
    currency: r?.currency,
    dailyBudgetMajor: round2(dailyBudgetCents / 100),
    spentToDateMajor: round2(spentCents / 100),
    remainingTodayMajor: round2(remainingCents / 100),
    projectedMonthRemainingMajor: round2(projectedCents / 100),
    daysInMonth: r?.daysInMonth,
    dayApplied: r?.dayApplied,
    risk: { projectedNegative },
    guestInfo: {
      // We infer guest vs registered from meta if present.
      // Convention: meta.guest?.createdUser === true => this user is still a guest.
      isGuest: !!result?.meta?.guest,
      canClaim: !!result?.meta?.guest,
    },
  };
}

ExpenseTableCompact transform:
	•	Input: /list-expenses result
	•	Output props:
	•	rows[]: { id, date, description, category, amountMajor, currency }
	•	window: { startDate, endDate, currency }

export function toExpenseTablePayload(result: any) {
  const data = result?.data ?? [];
  const rows = data.map((row: any) => ({
    id: row.id,
    date: row.date,
    description: row.description ?? row.raw_text ?? "",
    category: row.category,
    amountMajor: row.amountMajor ?? (row.amount_cents ? row.amount_cents / 100 : 0),
    currency: row.currency,
  }));

  return {
    rows,
    window: {
      startDate: result?.meta?.filters?.startDate ?? null,
      endDate: result?.meta?.filters?.endDate ?? null,
      currency: result?.meta?.filters?.currency ?? null,
    },
  };
}

CategoryBreakdownChart transform:
	•	Input: /expenses-summary structured JSON
	•	Output props:
	•	timeWindow { startDate, endDate }
	•	breakdown: array of {
currency,
totalAmountMajor,
totals: [{ category, amountMajor, share }]
}

export function toCategoryBreakdownPayload(result: any) {
  const d = result?.data ?? result;
  const breakdown = (d?.breakdown ?? []).map((b: any) => ({
    currency: b.currency,
    totalAmountMajor: b.totalAmountMajor,
    totals: b.totals, // [{category, amountMajor, share}]
  }));

  return {
    timeWindow: d?.timeWindow ?? {},
    breakdown,
  };
}

B.6 Tool registration

For each tool we register:
	•	Description tells the model when to use it.
	•	Input schema is the zod schema.
	•	_meta["openai/outputTemplate"] tells OpenAI which iframe resource to render.
	•	Handler:
	•	Calls proxy() with proper path.
	•	Applies transform.
	•	Returns { structuredContent: {...}, content: [...] }

Example: getBudget.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetBudgetInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';
import { toBudgetStatusCard } from '../lib/transform.js';

export function registerGetBudget(server: Server, widgetUris: { budget: string }) {
  server.registerTool(
    'moneko.get_budget',
    {
      title: 'Get budget pacing',
      description:
        'Call this when the user asks how much money they have left today or how they’re pacing this month. Always include date and currency if known.',
      inputSchema: GetBudgetInput,
      _meta: {
        'openai/outputTemplate': widgetUris.budget,
        'openai/widgetAccessible': true,
        'openai/toolInvocation/invoking': 'Checking your budget…',
        'openai/toolInvocation/invoked': 'Budget status ready.',
      },
    },
    async (args, extra) => {
      const payload = await proxy('/get-budget', args, extra.headers, true);
      return {
        structuredContent: {
          component: 'BudgetStatusCard',
          props: toBudgetStatusCard(payload),
        },
        content: [
          { type: 'text', text: 'Here’s your current budget status.' },
        ],
      };
    }
  );
}

Other tools follow the same pattern:
	•	moneko.set_budget: call /set-budget, then call /get-budget internally again to return updated BudgetStatusCard.
	•	moneko.save_expense: call /save-expense, then /get-budget for same date.
	•	moneko.expense_summary: call /expenses-summary, transform via toCategoryBreakdownPayload, render CategoryBreakdownChart widget.
	•	moneko.list_expenses: call /list-expenses, transform via toExpenseTablePayload, render ExpenseTableCompact widget.
	•	moneko.update_expense / moneko.delete_expense: call the relevant endpoint; then re-fetch /list-expenses (the widget needs to pass its current window back as tool args so we can refresh).
	•	moneko.start_auth: call internal endpoint that generates a claim link for this guest’s resolvedUserId → return structuredContent with { href }, and the widget will call openExternal(href).
	•	moneko.start_upgrade: same pattern but returns checkout/upgrade link.

B.7 MCP server transport

We expose an SSE endpoint and a POST backchannel. The skeleton in your spec is correct: /mcp for GET (SSE stream), /mcp/messages for POST messages, keyed by sessionId. You keep a session map in memory holding { server, transport }.

That’s how OpenAI’s Apps SDK will talk to our MCP server.

⸻

C. Widget Resources / CSP (@moneko-openai-app-sdk/web)

Widgets are iframes hosted by OpenAI but rendered with our code. We provide HTML files + embedded JS bundles.

C.1 Components to implement
	1.	BudgetStatusCard.tsx
	•	Props:
	•	date
	•	currency
	•	dailyBudgetMajor
	•	spentToDateMajor
	•	remainingTodayMajor
	•	projectedMonthRemainingMajor
	•	daysInMonth
	•	dayApplied
	•	risk.projectedNegative (bool)
	•	guestInfo.{ isGuest, canClaim }
	•	Renders:
	•	“€11.50 left today”
	•	“You planned €30/day”
	•	“You’ve spent €18.50 so far”
	•	“If you keep this pace, ~€120 left by end of month”
	•	Progress bar / pacing ring
	•	Button: “Adjust daily budget”
	•	Opens AdjustBudgetModal
	•	That modal calls window.openai.callTool('moneko.set_budget', { amount, date, currency })
	•	After success, BudgetStatusCard refreshes itself with returned props.
	•	If guestInfo.canClaim === true:
	•	Button: “Save this in Moneko”
	•	Calls window.openai.callTool('moneko.start_auth', {})
	•	Receives { href }
	•	Calls window.openai.openExternal({ href })
	•	If risk.projectedNegative === true:
	•	Banner: “You’re on track to overspend. Get proactive alerts.”
	•	Button: “Enable alerts”
	•	Calls window.openai.callTool('moneko.start_upgrade', {})
	•	Opens checkout URL
	•	Always include PrivacyPopover.
	2.	CategoryBreakdownChart.tsx
	•	Props:
	•	timeWindow { startDate, endDate }
	•	breakdown: array of {
currency,
totalAmountMajor,
totals: [{ category, amountMajor, share }]
}
	•	Renders:
	•	“€742.13 spent from 2025-10-01 to 2025-10-30”
	•	Breakdown list or donut-style breakdown (local SVG/Canvas; do NOT call remote chart APIs)
	•	Button: “See all transactions”
	•	Calls window.openai.callTool('moneko.list_expenses', { startDate, endDate, currency? })
	•	After that call, OpenAI will render the ExpenseTableCompact widget with new structuredContent
	•	If any single category share > 0.3:
	•	Small upsell text: “Get weekly ‘too much Restaurants’ nudges with Moneko Plus.”
	•	“Upgrade” button → same start_upgrade flow as above.
	•	PrivacyPopover.
	3.	ExpenseTableCompact.tsx
	•	Props:
	•	rows: [{ id, date, description, category, amountMajor, currency }]
	•	window: { startDate, endDate, currency }
	•	Renders:
	•	Table: Date | Description | Category | Amount
	•	For each row:
	•	Edit button:
	•	Opens EditExpenseModal.
	•	On save: calls
window.openai.callTool('moneko.update_expense', { expenseId, updates })
	•	After success: calls
window.openai.callTool('moneko.list_expenses', { startDate, endDate, currency })
to refresh table in-place.
	•	Delete button:
	•	Calls
window.openai.callTool('moneko.delete_expense', { expenseId })
	•	After success: same refresh logic.
	•	PrivacyPopover.
	4.	PrivacyPopover.tsx
	•	Simple info popover/tooltip at bottom of every widget:
	•	“Moneko keeps your expenses and budgets so you can review and edit them later. You can change or delete any entry. Read our Privacy Policy at moneko.io/privacy-policy.”
	•	This MUST exist for OpenAI review. It’s transparency + user control.
	5.	AdjustBudgetModal.tsx
	•	Controlled from BudgetStatusCard.
	•	Fields: new daily budget amount (number), currency (prefilled), date (prefilled = today).
	•	On submit:
	•	Calls moneko.set_budget
	•	Replaces local card props with returned result (BudgetStatusCard re-renders in-place).
	6.	EditExpenseModal.tsx
	•	Controlled from ExpenseTableCompact.
	•	Fields: category, amount, date, description, etc.
	•	On submit:
	•	Calls moneko.update_expense
	•	Then triggers a refresh via moneko.list_expenses.

C.2 Bridge (bridge.ts)

This file wraps host → MCP calls. Widgets must not talk directly to Supabase or hold secrets. They should ONLY go through the Apps SDK bridge.

export async function callTool(toolName: string, args: any) {
  if (!window.openai || !window.openai.callTool) {
    throw new Error("Bridge missing: callTool");
  }
  return await window.openai.callTool(toolName, args);
}

export function openExternal(href: string) {
  if (window.openai && window.openai.openExternal) {
    return window.openai.openExternal({ href });
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

We’ll also keep some minimal widget state in memory (for example, the last startDate, endDate, currency that ExpenseTableCompact used). That state needs to be re-sent to moneko.list_expenses after updates/deletes to refresh the table.

C.3 CSP and resource registration

We generate these widget HTML files in web/dist/:
	•	budget-status-card.html
	•	category-breakdown.html
	•	expense-table.html

Each HTML file:
	•	Inlines <script type="module"> ...bundle code... </script>
	•	Includes Content-Security-Policy that:
	•	Blocks external scripts.
	•	Allows connect-src only to https://budgeting.moneko.io if we ever allow direct reads (we should not for v1), and self.
	•	Allows img-src data: for inline SVG / base64.
	•	Allows style-src 'self' 'unsafe-inline' (inline styles are typically allowed in sandboxed iframes for now).
	•	For frame-ancestors: 'none' to prevent clickjacking outside ChatGPT.

Example CSP meta tag inside each HTML:

<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               connect-src 'self';
               img-src 'self' data:;
               style-src 'self' 'unsafe-inline';
               script-src 'self';
               frame-ancestors 'none';">

Note: we will tighten connect-src if we prove we never do direct fetches. Ideal end state is connect-src 'self' only.

C.4 registerWidgets() in MCP server

registerWidgets() (server side) will:
	•	Read each of the built *.html files from web/dist.
	•	Register each as an MCP “resource” with a stable URI:
	•	ui://widget/budget-status-card.html
	•	ui://widget/category-breakdown.html
	•	ui://widget/expense-table.html
	•	Return these URIs to tool registration so each tool can set _meta["openai/outputTemplate"] to the right one.

This is how we tell OpenAI:
“When you call moneko.get_budget, render this widget, using the props in structuredContent.”

⸻

D. Tool set and intent prompts

These descriptions will be included in server.registerTool(...) so ChatGPT knows when to call a given tool. This is critical for routing.

We will use exactly this wording (short, imperative, explicit):

moneko.save_expense
	•	Description: “Use this when the user says they bought/spent/paid something and wants it recorded. Requires amount, category, currency, and date. After saving, return the user’s updated budget pacing.”
	•	After call: server will also call /get-budget and respond with a BudgetStatusCard.

moneko.get_budget
	•	Description: “Use this when the user asks how much money they have left today or if they can afford something. Requires an explicit date (YYYY-MM-DD) and the currency if known.”
	•	Response: BudgetStatusCard.

moneko.set_budget
	•	Description: “Use this when the user asks to set or change their daily budget. Requires amount (major units), date, and currency. After setting, show updated pacing.”
	•	Response: BudgetStatusCard.

moneko.expense_summary
	•	Description: “Use this when the user asks where their money went in a given period, e.g. ‘why am I broke?’ or ‘show October spending’. Requires endDate. startDate optional.”
	•	Response: CategoryBreakdownChart.

moneko.list_expenses
	•	Description: “Use this to show all transactions for a given time range. Provide startDate and endDate. Include currency when available.”
	•	Response: ExpenseTableCompact.

moneko.update_expense
	•	Description: “Use this when the user wants to edit a specific previously listed expense.”
	•	After success: fetch moneko.list_expenses again (pass through the same date window) so the table refreshes.

moneko.delete_expense
	•	Description: “Use this when the user asks to delete a specific previously listed expense.”
	•	After success: re-fetch list_expenses for refresh.

moneko.start_auth
	•	Description: “Use this when the user taps ‘Save this in Moneko’ and wants to convert from a guest profile to a full Moneko account. Returns a secure link to open externally.”
	•	Widget will call this to kick off account claim.

moneko.start_upgrade
	•	Description: “Use this when the user taps an upgrade button to enable proactive alerts / advanced budgeting. Returns a secure checkout or upgrade link.”
	•	Widget opens the link externally.

Safety text to include in each tool’s _meta or description notes:
	•	We must frame all budget projections conditionally: “based on your current pace.”
	•	We do not provide investment advice.
	•	Always include explicit date and currency in tool calls. Never assume server defaults.

⸻

E. Testing Gates (no mocks)

The output of this section is how we will sign off before we hand to review.

E.1 Backend contract tests (Supabase Edge)

For each function:
	•	Call it with headers:
	•	OpenAI-Conversation-Id: test-conv
	•	Accept: application/json
	•	Confirm it returns structured JSON consistent with the documented schema.
	•	Confirm no household spend leaks into /expenses-summary in GPT-mode (personal use case only).
	•	Confirm /set-budget works for a brand new “test-conv” (guest bootstrap path fixed).
	•	Confirm /list-expenses respects currency filter.

This ensures:
	•	Identity flow is deterministic.
	•	The data we rely on for widgets is actually coming back in stable shape.

E.2 MCP server unit tests
	•	zod validation: invalid input to each tool is rejected with a 400-style message “Please include required fields…”.
	•	proxy() error mapping: 400/403/404/429/500 produce human-safe error messages.
	•	transform.* functions correctly convert cents → major units and produce required props.

E.3 MCP Inspector / local manual tests
	•	Start MCP server locally.
	•	Use an MCP inspector (or curl SSE manually) to:
	•	List tools.
	•	Call moneko.get_budget with { "date": "2025-10-30", "currency": "EUR" }.
	•	Ensure returned payload includes:
	•	structuredContent.component === "BudgetStatusCard".
	•	_meta.openai/outputTemplate points at ui://widget/budget-status-card.html.
	•	Call moneko.expense_summary and ensure the structuredContent matches what CategoryBreakdownChart expects.

E.4 Widget runtime tests
	•	Open each built dist/*.html (BudgetStatusCard, CategoryBreakdown, ExpenseTableCompact) in a controlled test harness that defines:

window.openai = {
  callTool: async (toolName, args) => { console.log(toolName, args); return mockResults; },
  openExternal: ({ href }) => { console.log("openExternal", href); },
};
window.__OPENAI_STRUCTURED_CONTENT__ = { component: "...", props: { ... } };


	•	Confirm:
	•	Components render with given props.
	•	“Adjust Budget” triggers a callTool('moneko.set_budget', ...).
	•	“Save this in Moneko” calls moneko.start_auth and then openExternal.
	•	“Enable alerts” calls moneko.start_upgrade.
	•	Expense table edit/delete triggers update/delete + re-fetch list_expenses with the same date window.
	•	Confirm PrivacyPopover always renders.

E.5 Mobile viewport sanity
	•	Test widgets (especially BudgetStatusCard and ExpenseTableCompact) in ~375px width viewport.
	•	Text must not overflow horizontally.
	•	Touch targets for edit/delete/adjust must be at least ~40px tall.

⸻

F. Security and Privacy Requirements

These are non-negotiable for review.

F.1 Secrets
	•	EDGE_API_KEY lives only in the MCP server process.
	•	Widgets never include EDGE_API_KEY, never talk directly to Supabase Edge.
	•	All writes (save_expense, set_budget, update_expense, delete_expense) MUST go through window.openai.callTool(...).

F.2 Identity headers
	•	The MCP server forwards OpenAI-Conversation-Id and OpenAI-Ephemeral-User-Id into Supabase Edge functions.
	•	Widgets NEVER send arbitrary userId. They can’t escalate privilege because they’re sandboxed and can only ask the host (OpenAI runtime) to call our tools, which then set headers.

F.3 CSP
	•	Widget HTML must include <meta http-equiv="Content-Security-Policy"> that:
	•	Blocks external JS.
	•	Limits connect-src.
	•	Forbids being framed by anything except ChatGPT (frame-ancestors ‘none’).
	•	Goal: even if someone rips the iframe HTML and opens it elsewhere, it has no credentials, can’t exfiltrate secrets, and can’t scrape other users’ data.

F.4 Tone / projections
	•	All budget visuals and text inside widgets must use conditional phrasing:
	•	“At this pace you’ll finish the month with ~€120 left.”
	•	“You’re on track to overspend by ~€85.”
	•	Never “You will save €120” or “Guaranteed €85 over budget.”
	•	No investment advice. We are budgeting only, not portfolio advisory.

F.5 PrivacyPopover
	•	Every widget must show:
	•	“Moneko keeps your expenses and budgets so you can review and edit them later. You can change or delete any entry. Read our Privacy Policy at moneko.io/privacy-policy.”
	•	This signals:
	•	Persistence.
	•	User control to edit/delete.
	•	Where to read policy.

OpenAI reviewers will look for this kind of disclosure.

⸻

G. Definition of Done / Ship Criteria

We are “ready to submit to OpenAI for review” when all of the following are true:
	1.	Backend fixes:
	•	/set-budget bug fixed and first-time guest callers succeed.
	•	/list-expenses filters by currency and is cleaned up.
	•	/expenses-summary returns structured JSON when Accept: application/json and excludes household data for GPT.
	•	/analyze-expense includes resolvedUserId and meta.
	•	gpt-guests uses deterministic lookup, not scanning listUsers().
	•	/get-budget and /set-budget both return structured JSON with Accept: application/json.
	2.	MCP server:
	•	Can start via node dist/index.js (or equivalent).
	•	Exposes SSE endpoint (/mcp) and POST backchannel (/mcp/messages).
	•	Registers all tools:
	•	moneko.save_expense
	•	moneko.get_budget
	•	moneko.set_budget
	•	moneko.expense_summary
	•	moneko.list_expenses
	•	moneko.update_expense
	•	moneko.delete_expense
	•	moneko.start_auth
	•	moneko.start_upgrade
	•	Each tool:
	•	Validates input with zod.
	•	Calls proxy() with correct Supabase path.
	•	Returns { structuredContent: { component, props }, content: [...] }.
	•	Sets _meta['openai/outputTemplate'] to the correct widget URI.
	•	Error paths return safe mapUserMessage messages.
	3.	Widget runtime:
	•	BudgetStatusCard, CategoryBreakdownChart, ExpenseTableCompact render with props from structuredContent.
	•	Buttons trigger correct MCP tool calls through bridge.ts.
	•	Adjust budget, edit expense, delete expense all work and re-render updated data.
	•	PrivacyPopover is present.
	•	CSP meta tag is included in all dist HTML files.
	•	No secrets in dist.
	4.	Upgrade + claim:
	•	moneko.start_auth returns a valid { href } to claim guest account.
	•	“Save this in Moneko” calls start_auth and opens that URL.
	•	moneko.start_upgrade returns { href } to Plus/Lifetime checkout.
	•	“Enable alerts / Upgrade” calls start_upgrade and opens that URL.
	5.	Golden prompt tests in ChatGPT dev mode:
	•	“I spent €12 on ramen yesterday, log it.”
→ moneko.save_expense called
→ BudgetStatusCard rendered
	•	“How much can I spend today?”
→ moneko.get_budget called
→ BudgetStatusCard rendered
	•	“Why am I broke this month?”
→ moneko.expense_summary called
→ CategoryBreakdownChart rendered
→ “See all transactions” → triggers moneko.list_expenses → ExpenseTableCompact rendered
	•	Edit/delete a transaction from the table, confirm UI updates.
	•	Click “Save this in Moneko,” confirm we get a claim URL.
	•	See overspend warning → click “Enable alerts,” confirm upgrade URL.

When all of the above hold true, we are functionally complete. At that point we can generate our app submission package for OpenAI with confidence.

⸻

This addendum is the contract. Build to it literally. If you implement each section as written, you’ll have:
	•	A compliant MCP server.
	•	Stable backend responses.
	•	Secure widgets that can read and mutate budgeting data.
	•	A working guest-to-account claim funnel.
	•	Upgrade hooks tied to Plus/Lifetime.
	•	Review-ready privacy/safety language.

From here, you can split work: backend engineer handles Section A, platform engineer handles Section B (MCP), frontend engineer handles Section C (widgets), then you converge on Section G to ship.