import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { UpdateExpenseInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';
import { toExpenseTablePayload } from '../lib/transform.js';
import { logger } from '../lib/logger.js';
import { parseExpenseRef } from '../lib/refs.js';

/**
 * Register the moneko.update_expense tool
 * After updating, re-fetches the expense list with the provided window
 */
export function registerUpdateExpense(server: Server, widgetUris: { expenseTable: string }) {
  server.setRequestHandler(
    { method: 'tools/call', params: { name: 'moneko.update_expense' } } as any,
    async (request: any) => {
      const args = UpdateExpenseInput.parse(request.params.arguments ?? {});
      // Extract window parameters for refresh (passed from widget)
      const refreshWindow = (request.params.arguments as any)?.refreshWindow ?? {};

      logger.info({ args, refreshWindow }, 'Calling moneko.update_expense');

      const expenseId = parseExpenseRef(args.expenseRef);
      if (!expenseId) {
        throw new Error('Invalid expense reference. Refresh the list and try again.');
      }

      // Update the expense
      await proxy('/update-expense', { expenseId, updates: args.updates }, request.meta?.headers ?? {}, true);

      // Re-fetch the expense list with the same window
      const listPayload = await proxy(
        '/list-expenses',
        {
          startDate: refreshWindow.startDate,
          endDate: refreshWindow.endDate,
          currency: refreshWindow.currency,
        },
        request.meta?.headers ?? {},
        true
      );

      const { props, expenseRefs } = toExpenseTablePayload(listPayload);

      return {
        content: [
          { type: 'text', text: 'Expense updated successfully.' },
        ],
        structuredContent: props,
        _meta: {
          'openai/outputTemplate': widgetUris.expenseTable,
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true,
          'moneko/expenseRefs': expenseRefs,
          'openai/toolInvocation/invoking': 'Updating expense…',
          'openai/toolInvocation/invoked': 'Expense updated.',
        },
      };
    }
  );
}

/**
 * Get tool definition for registration
 */
export function updateExpenseTool(widgetUris: { expenseTable: string }) {
  return {
    name: 'moneko.update_expense',
    title: 'Update Expense',
    description: 'Use this when the user wants to edit a specific previously listed expense.',
    inputSchema: {
      type: 'object',
      properties: {
        expenseRef: {
          type: 'string',
          description: 'Opaque expense reference from the widget (do not ask the user for IDs).',
        },
        updates: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            amount_cents: {
              type: 'number',
              description: 'Updated amount in cents',
            },
            category: {
              type: 'string',
              description: 'Updated category',
            },
            raw_text: {
              type: 'string',
              description: 'Updated description',
            },
            date: {
              type: 'string',
              description: 'Updated date (YYYY-MM-DD)',
            },
            currency: {
              type: 'string',
              description: 'Updated currency code',
            },
          },
          additionalProperties: false,
        },
        refreshWindow: {
          type: 'object',
          description: 'Window parameters for refreshing the list after update',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            currency: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      required: ['expenseRef', 'updates'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    _meta: {
      'openai/outputTemplate': widgetUris.expenseTable,
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Updating expense…',
      'openai/toolInvocation/invoked': 'Expense updated.',
    },
  };
}
