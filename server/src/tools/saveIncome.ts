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
    description: 'Record an income transaction (e.g., salary, refund, gift). Requires amount, category, currency, and date.',
    securitySchemes: [
      { type: 'oauth2', scopes: ['openid', 'profile', 'income:write'] },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Income amount (positive number)' },
        category: { type: 'string', description: 'Income category (e.g., income, salary, refund)' },
        currency: { type: 'string', description: 'Currency code (e.g., USD, EUR)' },
        date: { type: 'string', description: 'Date (YYYY-MM-DD or ISO datetime)' },
        description: { type: 'string', description: 'Optional description' },
        source: { type: 'string', description: 'Optional income source' },
        ownerType: { type: 'string', enum: ['me', 'partner', 'household'], description: 'Owner attribution' },
        privacyScope: { type: 'string', enum: ['private', 'balances_only', 'full'], description: 'Visibility scope' },
        householdId: { type: 'string', description: 'Optional household to share with' },
      },
      required: ['amount', 'category', 'currency', 'date'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  };
}

