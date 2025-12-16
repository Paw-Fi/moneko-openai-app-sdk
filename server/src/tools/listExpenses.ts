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
    description:
      'Use this when the user explicitly asks for a transaction list/ledger/recent transactions. Do not use for spending breakdowns (use moneko.expense_summary or get_summary).',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD), e.g. 2025-12-01.',
        },
        endDate: {
          type: 'string',
          description: 'End date (YYYY-MM-DD), e.g. 2025-12-31.',
        },
        currency: {
          type: 'string',
          description: 'Optional ISO currency code (3 letters), e.g. USD.',
        },
        limit: {
          type: 'number',
          description: 'Optional max rows (1-200).',
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
      'openai/outputTemplate': widgetUris.expenseTable,
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Loading your expenses…',
      'openai/toolInvocation/invoked': 'Expenses loaded.',
    },
  };
}
