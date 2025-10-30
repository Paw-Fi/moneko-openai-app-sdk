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
import { registerGetBudget, getBudgetTool } from './tools/getBudget.js';
import { registerSetBudget, setBudgetTool } from './tools/setBudget.js';
import { registerSaveExpense, saveExpenseTool } from './tools/saveExpense.js';
import { registerListExpenses, listExpensesTool } from './tools/listExpenses.js';
import { registerExpenseSummary, expenseSummaryTool } from './tools/expenseSummary.js';
import { registerUpdateExpense, updateExpenseTool } from './tools/updateExpense.js';
import { registerDeleteExpense, deleteExpenseTool } from './tools/deleteExpense.js';
import { registerStartAuth, startAuthTool } from './tools/startAuth.js';
import { registerStartUpgrade, startUpgradeTool } from './tools/startUpgrade.js';
import { logger } from './lib/logger.js';

/**
 * Create and configure the Moneko MCP server
 */
export function createMonekoServer(): Server {
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
  const { widgets, uris } = registerWidgets();
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

  // Register tool handlers
  registerGetBudget(server, uris);
  registerSetBudget(server, uris);
  registerSaveExpense(server, uris);
  registerListExpenses(server, uris);
  registerExpenseSummary(server, uris);
  registerUpdateExpense(server, uris);
  registerDeleteExpense(server, uris);
  registerStartAuth(server);
  registerStartUpgrade(server);

  logger.info({ toolCount: tools.length }, 'Registered MCP tools');

  return server;
}
