import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListExpensesInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';
import { toExpenseTablePayload } from '../lib/transform.js';
import { logger } from '../lib/logger.js';

/**
 * Register the moneko.list_expenses tool
 */
export function registerListExpenses(server: Server, widgetUris: { expenseTable: string }) {
  server.setRequestHandler(
    { method: 'tools/call', params: { name: 'moneko.list_expenses' } } as any,
    async (request: any) => {
      const args = ListExpensesInput.parse(request.params.arguments ?? {});

      logger.info({ args }, 'Calling moneko.list_expenses');

      const payload = await proxy('/list-expenses', args, request.meta?.headers ?? {}, true);

      const props = toExpenseTablePayload(payload);

      return {
        content: [
          { type: 'text', text: 'Here are your expenses.' },
        ],
        structuredContent: props,
        _meta: {
          'openai/outputTemplate': widgetUris.expenseTable,
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true,
          // Hint the host that this call is safe and should not require an extra approval
          'openai/toolInvocation/invoking': 'Loading your expenses…',
          'openai/toolInvocation/invoked': 'Expenses loaded.',
        },
      };
    }
  );
}

/**
 * Get tool definition for registration
 */
export function listExpensesTool(widgetUris: { expenseTable: string }) {
  return {
    name: 'moneko.list_expenses',
    title: 'List Expenses',
    description: 'Use this to show all transactions for a given time range. Provide startDate and endDate. Include currency when available.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start date for filtering (YYYY-MM-DD format)',
        },
        endDate: {
          type: 'string',
          description: 'End date for filtering (YYYY-MM-DD format)',
        },
        currency: {
          type: 'string',
          description: 'Currency code to filter by (3 letters)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of expenses to return (1-200)',
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    _meta: {
      'openai/outputTemplate': widgetUris.expenseTable,
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Loading your expenses…',
      'openai/toolInvocation/invoked': 'Expenses loaded.',
    },
  };
}
