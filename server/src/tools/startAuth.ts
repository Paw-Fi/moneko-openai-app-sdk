import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StartAuthInput } from '../schemas.js';
import { proxy } from '../lib/proxy.js';
import { logger } from '../lib/logger.js';

/**
 * Register the moneko.start_auth tool
 * Returns a claim link for guest-to-account conversion
 */
export function registerStartAuth(server: Server) {
  server.setRequestHandler(
    { method: 'tools/call', params: { name: 'moneko.start_auth' } } as any,
    async (request: any) => {
      const args = StartAuthInput.parse(request.params.arguments ?? {});

      logger.info({ args }, 'Calling moneko.start_auth');

      // Call backend to generate claim link for guest account conversion
      const payload = await proxy('/start-auth', args, request.meta?.headers ?? {}, true);

      const href = payload?.href || payload?.url || payload?.claimLink;

      if (!href) {
        throw new Error('Failed to generate authentication link');
      }

      return {
        content: [
          { type: 'text', text: 'Open this link to claim your account and save your data permanently.' },
        ],
        structuredContent: {
          href,
        },
        _meta: {
          'openai/toolInvocation/invoking': 'Generating claim link…',
          'openai/toolInvocation/invoked': 'Claim link ready.',
        },
      };
    }
  );
}

/**
 * Get tool definition for registration
 */
export function startAuthTool() {
  return {
    name: 'moneko.start_auth',
    title: 'Start Authentication',
    description: 'Use this when the user taps "Save this in Moneko" and wants to convert from a guest profile to a full Moneko account. Returns a secure link to open externally.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    _meta: {
      'openai/toolInvocation/invoking': 'Generating claim link…',
      'openai/toolInvocation/invoked': 'Claim link ready.',
    },
  };
}
