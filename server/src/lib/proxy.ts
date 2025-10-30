import { request } from 'undici';
import { normalizeError } from './errors.js';
import { logger } from './logger.js';

const base = process.env.EDGE_BASE_URL!;
const apiKey = process.env.EDGE_API_KEY!;

if (!base) {
  throw new Error('EDGE_BASE_URL environment variable is required');
}

if (!apiKey) {
  throw new Error('EDGE_API_KEY environment variable is required');
}

/**
 * Safe JSON parsing with fallback
 */
function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s };
  }
}

/**
 * Proxy requests to Supabase Edge functions
 *
 * @param path - Edge function path (e.g., '/get-budget')
 * @param body - Request body to send
 * @param incoming - Headers from incoming MCP request
 * @param acceptJson - Whether to request JSON response (default: true)
 * @returns Parsed response payload
 */
export async function proxy(
  path: string,
  body: unknown,
  incoming: Record<string, string | undefined>,
  acceptJson = true
): Promise<any> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'apikey': apiKey,
  };

  // Forward OpenAI identity headers so Supabase can resolve/create guest user
  const conv = incoming['openai-conversation-id'] ?? incoming['OpenAI-Conversation-Id'];
  const eph = incoming['openai-ephemeral-user-id'] ?? incoming['OpenAI-Ephemeral-User-Id'];

  if (conv) {
    headers['OpenAI-Conversation-Id'] = String(conv);
  }
  if (eph) {
    headers['OpenAI-Ephemeral-User-Id'] = String(eph);
  }

  // Request structured JSON response
  if (acceptJson) {
    headers['Accept'] = 'application/json';
  }

  const url = `${base}${path}`;

  logger.debug({ url, path, headers: { ...headers, apikey: '[REDACTED]' } }, 'Proxying request to Edge function');

  try {
    const res = await request(url, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
      headers,
    });

    const text = await res.body.text();
    const ctype = res.headers['content-type'] || '';
    const payload = ctype.includes('application/json') ? safeParse(text) : text;

    logger.debug({ status: res.statusCode, payload }, 'Received response from Edge function');

    if (res.statusCode >= 400) {
      throw normalizeError(res.statusCode, payload);
    }

    return payload;
  } catch (error) {
    if ((error as any).status) {
      // Already normalized error
      throw error;
    }

    // Network or other unexpected errors
    logger.error({ error, url }, 'Proxy request failed');
    throw new Error('Failed to connect to backend service. Please try again.');
  }
}
