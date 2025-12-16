import { request } from 'undici';
import { normalizeError } from './errors.js';
import { logger } from './logger.js';

/**
 * Get environment variables (lazily evaluated to allow dotenv to load first)
 */
function getEnvVars() {
  const base = process.env.EDGE_BASE_URL;
  const apiKey = process.env.EDGE_API_KEY;

  if (!base) {
    throw new Error('EDGE_BASE_URL environment variable is required');
  }

  if (!apiKey) {
    throw new Error('EDGE_API_KEY environment variable is required');
  }

  return { base, apiKey };
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
  const { base, apiKey } = getEnvVars();

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'apikey': apiKey,
  };

  // Forward OAuth bearer token so Edge functions can authorize as the logged-in user.
  const authorization = incoming['authorization'] ?? incoming['Authorization'];
  if (authorization) {
    headers['Authorization'] = String(authorization);
  }

  // Forward OpenAI identity headers only when we are not acting as a logged-in user.
  // Many Edge functions treat these headers as "GPT guest mode" and may return different shapes (e.g., Markdown),
  // so avoid sending them when an Authorization token is present.
  if (!authorization) {
    const conv = incoming['openai-conversation-id'] ?? incoming['OpenAI-Conversation-Id'];
    const eph = incoming['openai-ephemeral-user-id'] ?? incoming['OpenAI-Ephemeral-User-Id'];

    if (conv) {
      headers['OpenAI-Conversation-Id'] = String(conv);
    }
    if (eph) {
      headers['OpenAI-Ephemeral-User-Id'] = String(eph);
    }
  }

  // Request structured JSON response
  if (acceptJson) {
    headers['Accept'] = 'application/json';
  }

  const url = `${base}${path}`;

  const headersForLog: Record<string, string> = { ...headers, apikey: '[REDACTED]' };
  if ('Authorization' in headersForLog) headersForLog.Authorization = '[REDACTED]';

  logger.debug({ url, path, headers: headersForLog }, 'Proxying request to Edge function');

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

function toQueryString(query: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Proxy GET requests to Supabase Edge functions (for endpoints like /get-subscription).
 *
 * @param path - Edge function path (e.g., '/get-subscription')
 * @param query - Query parameters appended to the URL
 * @param incoming - Headers from incoming MCP request
 * @param acceptJson - Whether to request JSON response (default: true)
 * @returns Parsed response payload
 */
export async function proxyGet(
  path: string,
  query: Record<string, string | number | boolean | null | undefined>,
  incoming: Record<string, string | undefined>,
  acceptJson = true
): Promise<any> {
  const { base, apiKey } = getEnvVars();

  const headers: Record<string, string> = {
    'apikey': apiKey,
  };

  const authorization = incoming['authorization'] ?? incoming['Authorization'];
  if (authorization) {
    headers['Authorization'] = String(authorization);
  }

  if (acceptJson) {
    headers['Accept'] = 'application/json';
  }

  const url = `${base}${path}${toQueryString(query)}`;

  const headersForLog: Record<string, string> = { ...headers, apikey: '[REDACTED]' };
  if ('Authorization' in headersForLog) headersForLog.Authorization = '[REDACTED]';

  logger.debug({ url, path, headers: headersForLog }, 'Proxying GET request to Edge function');

  try {
    const res = await request(url, {
      method: 'GET',
      headers,
    });

    const text = await res.body.text();
    const ctype = res.headers['content-type'] || '';
    const payload = ctype.includes('application/json') ? safeParse(text) : text;

    logger.debug({ status: res.statusCode, payload }, 'Received response from Edge function (GET)');

    if (res.statusCode >= 400) {
      throw normalizeError(res.statusCode, payload);
    }

    return payload;
  } catch (error) {
    if ((error as any).status) {
      throw error;
    }

    logger.error({ error, url }, 'Proxy GET request failed');
    throw new Error('Failed to connect to backend service. Please try again.');
  }
}
