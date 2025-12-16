import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ExpenseSummaryInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';
import { toCategoryBreakdownPayload } from '../lib/transform.js';
import { logger } from '../lib/logger.js';

/**
 * Register the moneko.expense_summary tool
 */
export function registerExpenseSummary(server: Server, widgetUris: { categoryBreakdown: string }) {
  server.setRequestHandler(
    { method: 'tools/call', params: { name: 'moneko.expense_summary' } } as any,
    async (request: any) => {
      const args = ExpenseSummaryInput.parse(request.params.arguments ?? {});

      logger.info({ args }, 'Calling moneko.expense_summary');

      const payload = await proxy('/expenses-summary', args, request.meta?.headers ?? {}, true);

      const props = toCategoryBreakdownPayload(payload);

      return {
        content: [
          { type: 'text', text: 'Here\'s your spending breakdown by category.' },
        ],
        structuredContent: props,
        _meta: {
          'openai/outputTemplate': widgetUris.categoryBreakdown,
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true,
          'openai/toolInvocation/invoking': 'Analyzing your spending…',
          'openai/toolInvocation/invoked': 'Analysis complete.',
        },
      };
    }
  );
}

/**
 * Get tool definition for registration
 */
export function expenseSummaryTool(widgetUris: { categoryBreakdown: string }) {
  return {
    name: 'moneko.expense_summary',
    title: 'Get Expense Summary',
    description:
      'Use this when the user asks for a spending breakdown by category (e.g., “where did my money go this month?”). Do not use for listing individual transactions.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Optional start date (YYYY-MM-DD), e.g. 2025-12-01.',
        },
        endDate: {
          type: 'string',
          description: 'End date (YYYY-MM-DD), e.g. 2025-12-31.',
        },
        currency: {
          type: 'string',
          description: 'Optional currency filter (3 letters), e.g. USD.',
        },
        maxRows: {
          type: 'number',
          description: 'Optional maximum number of categories to return.',
        },
      },
      required: ['endDate'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    _meta: {
      'openai/outputTemplate': widgetUris.categoryBreakdown,
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Analyzing your spending…',
      'openai/toolInvocation/invoked': 'Analysis complete.',
    },
  };
}
