import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SetBudgetInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';
import { toBudgetStatusCard } from '../lib/transform.js';
import { logger } from '../lib/logger.js';

/**
 * Register the moneko.set_budget tool
 * After setting budget, calls get-budget to return updated status
 */
export function registerSetBudget(server: Server, widgetUris: { budget: string }) {
  server.setRequestHandler(
    { method: 'tools/call', params: { name: 'moneko.set_budget' } } as any,
    async (request: any) => {
      const args = SetBudgetInput.parse(request.params.arguments ?? {});

      logger.info({ args }, 'Calling moneko.set_budget');

      // First, set the budget
      await proxy('/set-budget', args, request.meta?.headers ?? {}, true);

      // Then fetch updated budget status
      const budgetPayload = await proxy(
        '/get-budget',
        { date: args.date, currency: args.currency },
        request.meta?.headers ?? {},
        true
      );

      const props = toBudgetStatusCard(budgetPayload);

      // AUDIT FIX: Return props directly in structuredContent
      return {
        content: [
          { type: 'text', text: 'Budget updated successfully. Here\'s your new status.' },
        ],
        structuredContent: props,
        _meta: {
          'openai/outputTemplate': widgetUris.budget,
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true,
          'openai/toolInvocation/invoking': 'Updating your budget…',
          'openai/toolInvocation/invoked': 'Budget updated.',
        },
      };
    }
  );
}

/**
 * Get tool definition for registration
 */
export function setBudgetTool(widgetUris: { budget: string }) {
  return {
    name: 'moneko.set_budget',
    title: 'Set Daily Budget',
    description: 'Use this when the user asks to set or change their daily budget. Requires amount (major units), date, and currency. After setting, show updated pacing.',
    securitySchemes: [
      { type: 'oauth2', scopes: ['openid', 'profile', 'budget:write'] },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Daily budget amount in major currency units (e.g., 25.50)',
        },
        date: {
          type: 'string',
          description: 'The date for budget (YYYY-MM-DD format)',
        },
        currency: {
          type: 'string',
          description: 'Currency code (3 letters, e.g., EUR, USD)',
        },
      },
      required: ['amount', 'date', 'currency'],
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
      'openai/toolInvocation/invoking': 'Updating your budget…',
      'openai/toolInvocation/invoked': 'Budget updated.',
    },
  };
}
