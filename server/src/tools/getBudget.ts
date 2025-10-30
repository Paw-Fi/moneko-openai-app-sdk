import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { GetBudgetInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';
import { toBudgetStatusCard } from '../lib/transform.js';
import { logger } from '../lib/logger.js';

/**
 * Register the moneko.get_budget tool
 */
export function registerGetBudget(server: Server, widgetUris: { budget: string }) {
  server.setRequestHandler(
    { method: 'tools/call', params: { name: 'moneko.get_budget' } } as any,
    async (request: any) => {
      const args = GetBudgetInput.parse(request.params.arguments ?? {});

      logger.info({ args }, 'Calling moneko.get_budget');

      const payload = await proxy('/get-budget', args, request.meta?.headers ?? {}, true);

      const props = toBudgetStatusCard(payload);

      return {
        content: [
          { type: 'text', text: 'Here\'s your current budget status.' },
        ],
        structuredContent: {
          component: 'BudgetStatusCard',
          props,
        },
        _meta: {
          'openai/outputTemplate': widgetUris.budget,
          'openai/widgetAccessible': true,
          'openai/toolInvocation/invoking': 'Checking your budget…',
          'openai/toolInvocation/invoked': 'Budget status ready.',
        },
      };
    }
  );
}

/**
 * Get tool definition for registration
 */
export function getBudgetTool(widgetUris: { budget: string }) {
  return {
    name: 'moneko.get_budget',
    description: 'Call this when the user asks how much money they have left today or how they\'re pacing this month. Always include date and currency if known.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'The date for budget check (YYYY-MM-DD format)',
        },
        currency: {
          type: 'string',
          description: 'Currency code (3 letters, e.g., EUR, USD)',
        },
        day: {
          type: 'number',
          description: 'Optional day override for projections',
        },
      },
      required: ['date'],
    },
    _meta: {
      'openai/outputTemplate': widgetUris.budget,
      'openai/widgetAccessible': true,
      'openai/toolInvocation/invoking': 'Checking your budget…',
      'openai/toolInvocation/invoked': 'Budget status ready.',
    },
  };
}
