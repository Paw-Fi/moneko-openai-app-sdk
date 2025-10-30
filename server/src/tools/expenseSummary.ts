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
        structuredContent: {
          component: 'CategoryBreakdownChart',
          props,
        },
        _meta: {
          'openai/outputTemplate': widgetUris.categoryBreakdown,
          'openai/widgetAccessible': true,
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
    description: 'Use this when the user asks where their money went in a given period, e.g. "why am I broke?" or "show October spending". Requires endDate. startDate optional.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Optional start date (lower bound, YYYY-MM-DD format)',
        },
        endDate: {
          type: 'string',
          description: 'End date (upper bound, YYYY-MM-DD format, required)',
        },
        currency: {
          type: 'string',
          description: 'Optional currency filter (3 letters)',
        },
        maxRows: {
          type: 'number',
          description: 'Optional maximum number of rows to return',
        },
      },
      required: ['endDate'],
    },
    _meta: {
      'openai/outputTemplate': widgetUris.categoryBreakdown,
      'openai/widgetAccessible': true,
      'openai/toolInvocation/invoking': 'Analyzing your spending…',
      'openai/toolInvocation/invoked': 'Analysis complete.',
    },
  };
}
