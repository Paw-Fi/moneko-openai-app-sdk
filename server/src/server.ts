import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type ListResourcesRequest,
  type ReadResourceRequest,
  type ListResourceTemplatesRequest,
  type ListToolsRequest,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { registerWidgets, type WidgetMetadata } from './widgets/register.js';
import { getBudgetTool } from './tools/getBudget.js';
import { setBudgetTool } from './tools/setBudget.js';
import { saveExpenseTool } from './tools/saveExpense.js';
import { listExpensesTool } from './tools/listExpenses.js';
import { expenseSummaryTool } from './tools/expenseSummary.js';
import { updateExpenseTool } from './tools/updateExpense.js';
import { deleteExpenseTool } from './tools/deleteExpense.js';
import { startAuthTool } from './tools/startAuth.js';
import { startUpgradeTool } from './tools/startUpgrade.js';
import { logger } from './lib/logger.js';
import { createSupabaseVerifier, SupabaseTokenVerifier } from './oauth/verifier.js';
import type { AccessToken } from './oauth/types.js';

/**
 * Tools that require authentication
 *
 * IMPORTANT:
 * - Read-only queries should not require OAuth so that new/guest users
 *   can immediately get value after connecting the app. We rely on
 *   OpenAI conversation headers to create an ephemeral guest profile
 *   in the backend.
 * - Mutating tools remain protected and will require a valid token
 *   when OAuth is configured.
 */
const PROTECTED_TOOLS = new Set([
  'moneko.set_budget',
  'moneko.save_expense',
  'moneko.update_expense',
  'moneko.delete_expense',
]);

/**
 * Authenticate request and extract user identity
 */
async function authenticateRequest(
  request: CallToolRequest,
  tokenVerifier: SupabaseTokenVerifier
): Promise<AccessToken | null> {
  const headers = (request as any).meta?.headers ?? {};
  const authHeader = headers.authorization;

  // Extract Bearer token
  const token = SupabaseTokenVerifier.extractBearerToken(authHeader);

  if (!token) {
    logger.warn({ toolName: request.params.name }, 'Missing authentication token');
    return null;
  }

  // Verify token
  const accessToken = await tokenVerifier.verifyToken(token);

  if (!accessToken) {
    logger.warn({ toolName: request.params.name }, 'Invalid or expired token');
    return null;
  }

  return accessToken;
}

/**
 * Create and configure the Moneko MCP server
 */
export function createMonekoServer(): Server {
  // Validate environment variables
  const edgeBaseUrl = process.env.EDGE_BASE_URL;
  const edgeApiKey = process.env.EDGE_API_KEY;

  if (!edgeBaseUrl || !edgeApiKey) {
    logger.error('Missing required environment variables: EDGE_BASE_URL and EDGE_API_KEY');
    throw new Error('Missing required environment variables. Check .env file.');
  }

  // Create OAuth token verifier
  let tokenVerifier: SupabaseTokenVerifier | null = null;
  try {
    tokenVerifier = createSupabaseVerifier();
    logger.info('OAuth token verifier initialized');
  } catch (error) {
    logger.warn({ error }, 'OAuth not configured - running without authentication');
  }

  const server = new Server(
    {
      name: 'moneko-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Register widgets and get their URIs
  let widgets: WidgetMetadata[];
  let uris: { budget: string; categoryBreakdown: string; expenseTable: string };

  try {
    const result = registerWidgets();
    widgets = result.widgets;
    uris = result.uris;

    const widgetsByUri = new Map<string, WidgetMetadata>();
    widgets.forEach((widget) => {
      widgetsByUri.set(widget.uri, widget);
    });

    logger.info({ widgetCount: widgets.length }, 'Registered widget resources');

    // Register resource handlers for widgets
    server.setRequestHandler(
      ListResourcesRequestSchema,
      async (_request: ListResourcesRequest) => {
        return {
          resources: widgets.map((w) => ({
            uri: w.uri,
            name: w.name,
            description: w.description,
            mimeType: 'text/html+skybridge',
            _meta: {
              'openai/outputTemplate': w.uri,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
            },
          })),
        };
      }
    );

    server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest) => {
        const widget = widgetsByUri.get(request.params.uri);

        if (!widget) {
          throw new Error(`Unknown resource: ${request.params.uri}`);
        }

        return {
          contents: [
            {
              uri: widget.uri,
              mimeType: 'text/html+skybridge',
              text: widget.html,
              _meta: {
                'openai/outputTemplate': widget.uri,
                'openai/widgetAccessible': true,
                'openai/resultCanProduceWidget': true,
              },
            },
          ],
        };
      }
    );

    server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (_request: ListResourceTemplatesRequest) => {
        return {
          resourceTemplates: widgets.map((w) => ({
            uriTemplate: w.uri,
            name: w.name,
            description: w.description,
            mimeType: 'text/html+skybridge',
            _meta: {
              'openai/outputTemplate': w.uri,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
            },
          })),
        };
      }
    );
  } catch (error) {
    logger.error({ error }, 'Failed to load widget assets from web/dist. Falling back to inline minimal widgets.');
    // Fallback: still expose widget resources with minimal inline HTML so
    // ChatGPT can render something instead of failing the run.
    uris = {
      budget: 'ui://widget/budget-status-card.html',
      categoryBreakdown: 'ui://widget/category-breakdown.html',
      expenseTable: 'ui://widget/expense-table.html',
    };

    const minimal = (rootId: string, title: string) =>
      `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{font:14px system-ui,sans-serif;margin:0;padding:12px;color:#111;background:#fff} .msg{padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa}</style><title>${title}</title></head><body><div id="${rootId}"><div class="msg">Widget assets not built. Showing fallback shell. Data: <pre id="__data__"></pre></div><script>try{var d=(window.openai&&window.openai.toolOutput)||{};document.getElementById('__data__').textContent=JSON.stringify(d,null,2)}catch{}</script></div></body></html>`;

    const fallbackWidgets: WidgetMetadata[] = [
      {
        uri: uris.budget,
        name: 'Budget Status Card',
        description: 'Fallback budget widget when assets are missing',
        html: minimal('budget-status-root', 'Budget Status'),
      },
      {
        uri: uris.categoryBreakdown,
        name: 'Category Breakdown',
        description: 'Fallback category breakdown widget when assets are missing',
        html: minimal('category-breakdown-root', 'Category Breakdown'),
      },
      {
        uri: uris.expenseTable,
        name: 'Expense Table',
        description: 'Fallback expense table widget when assets are missing',
        html: minimal('expense-table-root', 'Expenses'),
      },
    ];

    // Even on fallback, register resource endpoints so the host can resolve
    // the templates and render the UI shell.
    const widgetsByUri = new Map<string, WidgetMetadata>();
    fallbackWidgets.forEach((w) => widgetsByUri.set(w.uri, w));

    server.setRequestHandler(
      ListResourcesRequestSchema,
      async (_request: ListResourcesRequest) => ({
        resources: fallbackWidgets.map((w) => ({
          uri: w.uri,
          name: w.name,
          description: w.description,
          mimeType: 'text/html+skybridge',
          _meta: {
            'openai/outputTemplate': w.uri,
            'openai/widgetAccessible': true,
            'openai/resultCanProduceWidget': true,
          },
        })),
      })
    );

    server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest) => {
        const widget = widgetsByUri.get(request.params.uri);
        if (!widget) throw new Error(`Unknown resource: ${request.params.uri}`);
        return {
          contents: [
            {
              uri: widget.uri,
              mimeType: 'text/html+skybridge',
              text: widget.html,
              _meta: {
                'openai/outputTemplate': widget.uri,
                'openai/widgetAccessible': true,
                'openai/resultCanProduceWidget': true,
              },
            },
          ],
        };
      }
    );

    server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (_request: ListResourceTemplatesRequest) => ({
        resourceTemplates: fallbackWidgets.map((w) => ({
          uriTemplate: w.uri,
          name: w.name,
          description: w.description,
          mimeType: 'text/html+skybridge',
          _meta: {
            'openai/outputTemplate': w.uri,
            'openai/widgetAccessible': true,
            'openai/resultCanProduceWidget': true,
          },
        })),
      })
    );
  }

  // Register all tools
  const tools = [
    getBudgetTool(uris),
    setBudgetTool(uris),
    saveExpenseTool(uris),
    listExpensesTool(uris),
    expenseSummaryTool(uris),
    updateExpenseTool(uris),
    deleteExpenseTool(uris),
    startAuthTool(),
    startUpgradeTool(),
  ];

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => {
      return { tools };
    }
  );

  // Register unified tool call handler with OAuth authentication
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      const toolName = request.params.name;
      const args = request.params.arguments ?? {};
      const headers = (request as any).meta?.headers ?? {};

      logger.info({ toolName, args }, 'Tool called');

      // Authenticate protected tools
      let user: AccessToken | null = null;
      if (PROTECTED_TOOLS.has(toolName)) {
        if (!tokenVerifier) {
          logger.warn('OAuth not configured, allowing unauthenticated access');
        } else {
          user = await authenticateRequest(request, tokenVerifier);

          if (!user) {
            throw new Error(
              'Authentication required. Please log in with your Moneko account to access your data.'
            );
          }

          logger.info({ userId: user.subject, toolName }, 'Authenticated user request');

          // Add user ID to headers for Supabase backend
          headers['x-user-id'] = user.subject;
          headers['x-user-email'] = user.subject; // Backend expects email as identifier
        }
      }

      // Route to appropriate tool handler
      switch (toolName) {
        case 'moneko.get_budget': {
          const { GetBudgetInput } = await import('./schemas.js');
          const { proxy } = await import('./lib/proxy.js');
          const { toBudgetStatusCard } = await import('./lib/transform.js');

          const validArgs = GetBudgetInput.parse(args);
          const payload = await proxy('/get-budget', validArgs, headers, true);
          const props = toBudgetStatusCard(payload);

          return {
            content: [{ type: 'text', text: 'Here\'s your current budget status.' }],
            structuredContent: props,
            _meta: {
              'openai/outputTemplate': uris.budget,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
            },
          };
        }

        case 'moneko.set_budget': {
          const { SetBudgetInput } = await import('./schemas.js');
          const { proxy } = await import('./lib/proxy.js');
          const { toBudgetStatusCard } = await import('./lib/transform.js');

          const validArgs = SetBudgetInput.parse(args);
          await proxy('/set-budget', validArgs, headers, true);

          const budgetPayload = await proxy(
            '/get-budget',
            { date: validArgs.date, currency: validArgs.currency },
            headers,
            true
          );
          const props = toBudgetStatusCard(budgetPayload);

          return {
            content: [{ type: 'text', text: 'Budget updated successfully. Here\'s your new status.' }],
            structuredContent: props,
            _meta: {
              'openai/outputTemplate': uris.budget,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
            },
          };
        }

        case 'moneko.save_expense': {
          const { SaveExpenseInput } = await import('./schemas.js');
          const { proxy } = await import('./lib/proxy.js');
          const { toBudgetStatusCard } = await import('./lib/transform.js');

          const validArgs = SaveExpenseInput.parse(args);
          await proxy('/save-expense', validArgs, headers, true);

          const budgetPayload = await proxy(
            '/get-budget',
            { date: validArgs.date, currency: validArgs.currency },
            headers,
            true
          );
          const props = toBudgetStatusCard(budgetPayload);

          return {
            content: [{ type: 'text', text: 'Expense saved successfully. Here\'s your updated budget.' }],
            structuredContent: props,
            _meta: {
              'openai/outputTemplate': uris.budget,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
            },
          };
        }

        case 'moneko.list_expenses': {
          const { ListExpensesInput } = await import('./schemas.js');
          const { proxy } = await import('./lib/proxy.js');
          const { toExpenseTablePayload } = await import('./lib/transform.js');

          const validArgs = ListExpensesInput.parse(args);
          const payload = await proxy('/list-expenses', validArgs, headers, true);
          const props = toExpenseTablePayload(payload);

          return {
            content: [{ type: 'text', text: 'Here are your expenses.' }],
            structuredContent: props,
            _meta: {
              'openai/outputTemplate': uris.expenseTable,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
            },
          };
        }

        case 'moneko.expense_summary': {
          const { ExpenseSummaryInput } = await import('./schemas.js');
          const { proxy } = await import('./lib/proxy.js');
          const { toCategoryBreakdownPayload } = await import('./lib/transform.js');

          const validArgs = ExpenseSummaryInput.parse(args);
          const payload = await proxy('/expenses-summary', validArgs, headers, true);
          const props = toCategoryBreakdownPayload(payload);

          return {
            content: [{ type: 'text', text: 'Here\'s your spending breakdown by category.' }],
            structuredContent: props,
            _meta: {
              'openai/outputTemplate': uris.categoryBreakdown,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
            },
          };
        }

        case 'moneko.update_expense': {
          const { UpdateExpenseInput } = await import('./schemas.js');
          const { proxy } = await import('./lib/proxy.js');
          const { toExpenseTablePayload } = await import('./lib/transform.js');

          const validArgs = UpdateExpenseInput.parse(args);
          const refreshWindow = (args as any).refreshWindow ?? {};

          await proxy('/update-expense', { expenseId: validArgs.expenseId, updates: validArgs.updates }, headers, true);

          const listPayload = await proxy(
            '/list-expenses',
            {
              startDate: refreshWindow.startDate,
              endDate: refreshWindow.endDate,
              currency: refreshWindow.currency,
            },
            headers,
            true
          );
          const props = toExpenseTablePayload(listPayload);

          return {
            content: [{ type: 'text', text: 'Expense updated successfully.' }],
            structuredContent: props,
            _meta: {
              'openai/outputTemplate': uris.expenseTable,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
            },
          };
        }

        case 'moneko.delete_expense': {
          const { DeleteExpenseInput } = await import('./schemas.js');
          const { proxy } = await import('./lib/proxy.js');
          const { toExpenseTablePayload } = await import('./lib/transform.js');

          const validArgs = DeleteExpenseInput.parse(args);
          const refreshWindow = (args as any).refreshWindow ?? {};

          await proxy('/delete-expense', validArgs, headers, true);

          const listPayload = await proxy(
            '/list-expenses',
            {
              startDate: refreshWindow.startDate,
              endDate: refreshWindow.endDate,
              currency: refreshWindow.currency,
            },
            headers,
            true
          );
          const props = toExpenseTablePayload(listPayload);

          return {
            content: [{ type: 'text', text: 'Expense deleted successfully.' }],
            structuredContent: props,
            _meta: {
              'openai/outputTemplate': uris.expenseTable,
              'openai/widgetAccessible': true,
              'openai/resultCanProduceWidget': true,
            },
          };
        }

        case 'moneko.start_auth': {
          const { StartAuthInput } = await import('./schemas.js');
          const { proxy } = await import('./lib/proxy.js');

          const validArgs = StartAuthInput.parse(args);
          const payload = await proxy('/start-auth', validArgs, headers, true);
          const href = payload?.href || payload?.url || payload?.claimLink;

          if (!href) {
            throw new Error('Failed to generate authentication link');
          }

          return {
            content: [{ type: 'text', text: 'Open this link to claim your account and save your data permanently.' }],
            structuredContent: { href },
          };
        }

        case 'moneko.start_upgrade': {
          const { StartUpgradeInput } = await import('./schemas.js');
          const { proxy } = await import('./lib/proxy.js');

          const validArgs = StartUpgradeInput.parse(args);
          const payload = await proxy('/start-upgrade', validArgs, headers, true);
          const href = payload?.href || payload?.url || payload?.checkoutLink;

          if (!href) {
            throw new Error('Failed to generate upgrade link');
          }

          return {
            content: [{ type: 'text', text: 'Open this link to upgrade and unlock proactive alerts and advanced features.' }],
            structuredContent: { href },
          };
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    }
  );

  logger.info({ toolCount: tools.length }, 'Registered MCP tool handler');

  logger.info('Created Moneko MCP server successfully');
  return server;
}
