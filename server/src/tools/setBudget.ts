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
    description:
      'Use this when the user asks to set or change their DAILY budget (e.g., “set my budget to $30/day”). Do not use for one-off expense logging.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Daily budget amount in major units (e.g., 25.50).',
        },
        date: {
          type: 'string',
          description: 'Date to apply the budget from (YYYY-MM-DD), e.g. 2025-12-16.',
        },
        currency: {
          type: 'string',
          description: 'ISO currency code (3 letters), e.g., EUR, USD.',
        },
      },
      required: ['amount', 'date', 'currency'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
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
