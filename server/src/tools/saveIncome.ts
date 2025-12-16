import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SaveIncomeInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';

/**
 * Register the moneko.save_income tool
 */
export function registerSaveIncome(server: Server) {
  server.setRequestHandler(
    { method: 'tools/call', params: { name: 'moneko.save_income' } } as any,
    async (request: any) => {
      const args = SaveIncomeInput.parse(request.params.arguments ?? {});

      await proxy('/save-income', args, request.meta?.headers ?? {}, true);

      return {
        content: [
          { type: 'text', text: 'Income saved successfully.' },
        ],
      };
    }
  );
}

/**
 * Tool definition for registration
 */
export function saveIncomeTool() {
  return {
    name: 'moneko.save_income',
    title: 'Save Income',
    description:
      'Use this when the user wants to record income (e.g., salary, refund, gift). Do not use for expenses or summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Income amount in major units (e.g., 2500.00).' },
        category: { type: 'string', description: 'Income category (e.g., Salary, Refund).' },
        currency: { type: 'string', description: 'ISO currency code (e.g., USD, EUR).' },
        date: { type: 'string', description: 'Date (YYYY-MM-DD or ISO datetime).' },
        description: { type: 'string', description: 'Optional note/description.' },
        source: { type: 'string', description: 'Optional income source.' },
        ownerType: { type: 'string', enum: ['me', 'partner', 'household'], description: 'Owner attribution (optional).' },
        privacyScope: { type: 'string', enum: ['private', 'balances_only', 'full'], description: 'Visibility scope (optional).' },
        householdId: { type: 'string', description: 'Optional household to share with.' },
      },
      required: ['amount', 'category', 'currency', 'date'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  };
}
