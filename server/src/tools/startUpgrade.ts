import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StartUpgradeInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';
import { logger } from '../lib/logger.js';

/**
 * Register the moneko.start_upgrade tool
 * Returns a checkout/upgrade link for Plus/Lifetime features
 */
export function registerStartUpgrade(server: Server) {
  server.setRequestHandler(
    { method: 'tools/call', params: { name: 'moneko.start_upgrade' } } as any,
    async (request: any) => {
      const args = StartUpgradeInput.parse(request.params.arguments ?? {});

      logger.info({ args }, 'Calling moneko.start_upgrade');

      // Call backend to generate upgrade/checkout link
      const payload = await proxy('/start-upgrade', args, request.meta?.headers ?? {}, true);

      const href = payload?.href || payload?.url || payload?.checkoutLink;

      if (!href) {
        throw new Error('Failed to generate upgrade link');
      }

      return {
        content: [
          { type: 'text', text: 'Open this link to upgrade and unlock proactive alerts and advanced features.' },
        ],
        structuredContent: {
          href,
        },
        _meta: {
          'openai/toolInvocation/invoking': 'Generating upgrade link…',
          'openai/toolInvocation/invoked': 'Upgrade link ready.',
        },
      };
    }
  );
}

/**
 * Get tool definition for registration
 */
export function startUpgradeTool() {
  return {
    name: 'moneko.start_upgrade',
    description: 'Use this when the user taps an upgrade button to enable proactive alerts / advanced budgeting. Returns a secure checkout or upgrade link.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    _meta: {
      'openai/toolInvocation/invoking': 'Generating upgrade link…',
      'openai/toolInvocation/invoked': 'Upgrade link ready.',
    },
  };
}
