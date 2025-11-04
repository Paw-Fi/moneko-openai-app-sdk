import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SaveExpenseInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';
import { toBudgetStatusCard } from '../lib/transform.js';
import { logger } from '../lib/logger.js';

/**
 * Register the moneko.save_expense tool
 * After saving expense, calls get-budget to return updated budget status
 */
export function registerSaveExpense(server: Server, widgetUris: { budget: string }) {
  server.setRequestHandler(
    { method: 'tools/call', params: { name: 'moneko.save_expense' } } as any,
    async (request: any) => {
      const args = SaveExpenseInput.parse(request.params.arguments ?? {});

      logger.info({ args }, 'Calling moneko.save_expense');

      // First, save the expense
      await proxy('/save-expense', args, request.meta?.headers ?? {}, true);

      // Then fetch updated budget status for the same date
      const budgetPayload = await proxy(
        '/get-budget',
        { date: args.date, currency: args.currency },
        request.meta?.headers ?? {},
        true
      );

      const props = toBudgetStatusCard(budgetPayload);

      return {
        content: [
          { type: 'text', text: `Expense saved successfully. Here's your updated budget.` },
        ],
        structuredContent: props,
        _meta: {
          'openai/outputTemplate': widgetUris.budget,
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true,
          'openai/toolInvocation/invoking': 'Saving expense…',
          'openai/toolInvocation/invoked': 'Expense saved.',
        },
      };
    }
  );
}

/**
 * Get tool definition for registration
 */
export function saveExpenseTool(widgetUris: { budget: string }) {
  return {
    name: 'moneko.save_expense',
    title: 'Save Expense',
    description: 'Use this when the user says they bought/spent/paid something and wants it recorded. Requires amount, category, currency, and date. After saving, return the user\'s updated budget pacing.',
    securitySchemes: [
      { type: 'oauth2', scopes: ['openid', 'profile', 'expenses:write'] },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Expense amount (positive number)',
        },
        category: {
          type: 'string',
          description: 'Expense category (e.g., Food, Transport, Entertainment)',
        },
        currency: {
          type: 'string',
          description: 'Currency code (3 letters, e.g., EUR, USD)',
        },
        date: {
          type: 'string',
          description: 'Expense date (YYYY-MM-DD or ISO datetime)',
        },
        clientCreatedAt: {
          type: 'string',
          description: 'Optional client timestamp',
        },
        description: {
          type: 'string',
          description: 'Optional expense description',
        },
        receiptImageUrl: {
          type: 'string',
          description: 'Optional receipt image URL',
        },
      },
      required: ['amount', 'category', 'currency', 'date'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    _meta: {
      'openai/outputTemplate': widgetUris.budget,
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Saving expense…',
      'openai/toolInvocation/invoked': 'Expense saved.',
    },
  };
}
