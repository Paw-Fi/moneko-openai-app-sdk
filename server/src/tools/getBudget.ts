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

      // AUDIT FIX: structuredContent should be props directly, not wrapped
      // The host hydrates window.openai.toolOutput with structuredContent
      // Widget selection is handled by _meta['openai/outputTemplate']
      return {
        content: [
          { type: 'text', text: 'Here\'s your current budget status.' },
        ],
        structuredContent: props,
        _meta: {
          'openai/outputTemplate': widgetUris.budget,
          'openai/widgetAccessible': true,
          'openai/toolInvocation/invoking': 'Checking your budget…',
          'openai/toolInvocation/invoked': 'Budget status ready.',
          'openai/resultCanProduceWidget': true,
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
    title: 'Get Budget Status',
    description:
      'Use this when the user asks how much budget they have left today or how they are pacing this month. Do not use for listing transactions.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date for budget check (YYYY-MM-DD), e.g. 2025-12-16.',
        },
        currency: {
          type: 'string',
          description: 'Optional ISO currency code (3 letters), e.g., EUR, USD.',
        },
        day: {
          type: 'number',
          description: 'Optional day override for projections (1-31).',
        },
      },
      required: ['date'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    _meta: {
      'openai/outputTemplate': widgetUris.budget,
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Checking your budget…',
      'openai/toolInvocation/invoked': 'Budget status ready.',
    },
  };
}
