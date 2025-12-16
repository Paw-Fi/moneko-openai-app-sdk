import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMonekoServer } from './server.js';
import { logger } from './lib/logger.js';
import { setLastPublicBaseUrl } from './lib/public-base-url.js';
// OAuth removed for MVP
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(serverRoot, '..');
const webDistDir = path.join(projectRoot, 'web', 'dist');
const assetsPrefix = '/assets/';

type SessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();


type StreamSessionRecord = {
  server: Server;
  transport: StreamableHTTPServerTransport;
};

const streamSessions = new Map<string, StreamSessionRecord>();


const ssePath = '/mcp';
const postPath = '/mcp/messages'; // legacy SSE message endpoint

// Minimal OAuth state (enough for ChatGPT connector creation + Supabase-backed auth-code+PKCE)
const oauthClients = new Map<string, { redirect_uris?: string[]; createdAt: number }>();
const oauthRequests = new Map<
  string,
  {
    clientId: string;
    redirectUri: string;
    state?: string;
    scope?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    createdAt: number;
  }
>();
const oauthCodes = new Map<
  string,
  {
    clientId: string;
    redirectUri: string;
    state?: string;
    scope?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    supabaseAccessToken: string;
    userId: string;
    createdAt: number;
  }
>();

function base64urlEncode(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function sha256Base64Url(input: string): string {
  return base64urlEncode(createHash('sha256').update(input).digest());
}

function getBearerToken(authorizationHeader: unknown): string | undefined {
  if (!authorizationHeader) return undefined;
  const value = Array.isArray(authorizationHeader)
    ? authorizationHeader[authorizationHeader.length - 1]
    : authorizationHeader;
  const s = String(value || '').trim();
  if (!s) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(s);
  return m?.[1]?.trim() || undefined;
}

function verifySupabaseJwt(token: string, secret: string): { userId: string; exp?: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  if (header?.alg !== 'HS256') return null;
  const data = `${headerB64}.${payloadB64}`;
  const expected = base64urlEncode(createHmac('sha256', secret).update(data).digest());

  try {
    const a = Buffer.from(signatureB64);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  const exp = typeof payload?.exp === 'number' ? payload.exp : undefined;
  if (exp && Date.now() / 1000 >= exp) return null;

  const userId = typeof payload?.sub === 'string' ? payload.sub : undefined;
  if (!userId) return null;
  return { userId, exp };
}

function sendUnauthorized(res: ServerResponse) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Bearer realm="moneko"',
    'Cache-Control': 'no-store',
  });
  res.end('Unauthorized');
}

function getAssetContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.json':
    case '.map':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function serveAsset(req: IncomingMessage, res: ServerResponse, url: URL) {
  const requested = (req.headers['access-control-request-headers'] as string) || 'content-type';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': requested,
      'Access-Control-Max-Age': '600',
      Vary: 'Access-Control-Request-Headers',
    });
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' }).end('Method Not Allowed');
    return;
  }

  let rel = url.pathname.slice(assetsPrefix.length);
  try {
    rel = decodeURIComponent(rel);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }

  // Prevent path traversal
  const full = path.resolve(webDistDir, rel);
  const normalizedRoot = webDistDir.endsWith(path.sep) ? webDistDir : webDistDir + path.sep;
  if (!full.startsWith(normalizedRoot)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(full);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    res.writeHead(404).end('Not Found');
    return;
  }

  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'public, max-age=3600',
    'Content-Type': getAssetContentType(full),
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(full);
  stream.on('error', (error) => {
    logger.error({ error, full }, 'Failed to read asset file');
    if (!res.headersSent) res.writeHead(500);
    res.end('Internal Server Error');
  });
  stream.pipe(res);
}

/**
 * Ensure Accept header includes both application/json and text/event-stream.
 * Some clients (or curl) omit these, but the Streamable HTTP transport requires them.
 */
function ensureAcceptHeader(req: IncomingMessage) {
  const raw = String(req.headers['accept'] || '').toLowerCase();
  const parts = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  if (!Array.from(parts).some((p) => p.startsWith('application/json'))) {
    parts.add('application/json');
  }
  if (!Array.from(parts).some((p) => p.startsWith('text/event-stream'))) {
    parts.add('text/event-stream');
  }
  (req.headers as any)['accept'] = Array.from(parts).join(', ');
}

function ensureJsonContentType(req: IncomingMessage) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('application/json')) {
    (req.headers as any)['content-type'] = 'application/json; charset=utf-8';
  }
}

function guessBaseUrl(req: IncomingMessage): string {
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const rawProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = rawProto || (rawHost.startsWith('localhost') || rawHost.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${rawHost}`;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    const key = decodeURIComponent(k.replace(/\+/g, ' '));
    const val = decodeURIComponent(v.replace(/\+/g, ' '));
    out[key] = val;
  }
  return out;
}

async function handleOAuth(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const pathname = url.pathname;
  const baseUrl = guessBaseUrl(req).replace(/\/+$/, '');
  const webBaseUrl = String(process.env.WEB_BASE_URL || '')
    .replace(/\/+$/, '')
    .replace(/\/oauth\/finish$/i, '');
  const supabaseJwtSecret = String(process.env.SUPABASE_JWT_SECRET || '');

  if (req.method === 'OPTIONS' && pathname.startsWith('/oauth/')) {
    const requested = (req.headers['access-control-request-headers'] as string) || 'content-type, authorization';
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': requested,
      'Access-Control-Max-Age': '600',
      Vary: 'Access-Control-Request-Headers',
    });
    res.end();
    return true;
  }

  // RFC 7591 Dynamic Client Registration
  if (pathname === '/oauth/register' && req.method === 'POST') {
    const raw = await readBody(req);
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    const clientId = randomUUID();
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
    oauthClients.set(clientId, { redirect_uris: redirectUris, createdAt: Date.now() });

    json(res, 201, {
      client_id: clientId,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      redirect_uris: redirectUris,
      client_name: body.client_name ?? 'Moneko (dynamic)',
      registration_client_uri: `${baseUrl}/oauth/register/${clientId}`,
    });
    return true;
  }

  // Authorization endpoint (redirects to Moneko web for Supabase auth)
  if (pathname === '/oauth/authorize' && req.method === 'GET') {
    const clientId = String(url.searchParams.get('client_id') || '');
    const redirectUri = String(url.searchParams.get('redirect_uri') || '');
    const state = String(url.searchParams.get('state') || '');
    const codeChallenge = url.searchParams.get('code_challenge') || undefined;
    const codeChallengeMethod = url.searchParams.get('code_challenge_method') || undefined;
    const scope = url.searchParams.get('scope') || undefined;

    if (!clientId || !redirectUri) {
      res.writeHead(400).end('Missing client_id or redirect_uri');
      return true;
    }

    const registered = oauthClients.get(clientId);
    if (registered?.redirect_uris?.length && !registered.redirect_uris.includes(redirectUri)) {
      res.writeHead(400).end('Invalid redirect_uri');
      return true;
    }

    if (!webBaseUrl) {
      res.writeHead(500).end('Missing WEB_BASE_URL');
      return true;
    }

    const requestId = randomUUID();
    oauthRequests.set(requestId, {
      clientId,
      redirectUri,
      state: state || undefined,
      scope,
      codeChallenge,
      codeChallengeMethod,
      createdAt: Date.now(),
    });

    const redirect = new URL(`${webBaseUrl}/oauth/finish`);
    redirect.searchParams.set('request_id', requestId);
    redirect.searchParams.set('mcp_base_url', baseUrl);
    res.writeHead(302, { Location: redirect.toString() });
    res.end();
    return true;
  }

  // Called by moneko-web after Supabase login, to mint an auth code for the client
  if (pathname === '/oauth/complete' && req.method === 'POST') {
    const raw = await readBody(req);
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    const requestId = String(body.request_id || '');
    const supabaseAccessToken = String(body.access_token || '');
    if (!requestId || !supabaseAccessToken) {
      json(res, 400, { error: 'invalid_request' });
      return true;
    }

    const request = oauthRequests.get(requestId);
    if (!request) {
      json(res, 400, { error: 'invalid_request' });
      return true;
    }

    if (!supabaseJwtSecret) {
      logger.error('Missing SUPABASE_JWT_SECRET; cannot verify Supabase access token');
      json(res, 500, { error: 'server_misconfigured', error_description: 'Missing SUPABASE_JWT_SECRET' });
      return true;
    }

    const verified = verifySupabaseJwt(supabaseAccessToken, supabaseJwtSecret);
    if (!verified) {
      logger.warn('Supabase access token verification failed');
      json(res, 401, { error: 'invalid_token' });
      return true;
    }

    oauthRequests.delete(requestId);
    const code = randomUUID();
    oauthCodes.set(code, {
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      state: request.state,
      scope: request.scope,
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: request.codeChallengeMethod,
      supabaseAccessToken,
      userId: verified.userId,
      createdAt: Date.now(),
    });

    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set('code', code);
    if (request.state) redirect.searchParams.set('state', request.state);

    json(res, 200, { redirectUrl: redirect.toString() });
    return true;
  }

  // Token endpoint (authorization_code)
  if (pathname === '/oauth/token' && req.method === 'POST') {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    const raw = await readBody(req);
    const form = contentType.includes('application/json') ? (() => {
      try { return JSON.parse(raw || '{}'); } catch { return {}; }
    })() : parseForm(raw || '');

    const grantType = String((form as any).grant_type || '');
    if (grantType !== 'authorization_code') {
      json(res, 400, { error: 'unsupported_grant_type' });
      return true;
    }

    const code = String((form as any).code || '');
    const redirectUri = String((form as any).redirect_uri || '');
    const clientId = String((form as any).client_id || '');
    const codeVerifier = String((form as any).code_verifier || '');
    const record = oauthCodes.get(code);
    if (!record || record.clientId !== clientId || record.redirectUri !== redirectUri) {
      json(res, 400, { error: 'invalid_grant' });
      return true;
    }

    oauthCodes.delete(code);
    const ageMs = Date.now() - record.createdAt;
    if (ageMs > 10 * 60 * 1000) {
      json(res, 400, { error: 'invalid_grant' });
      return true;
    }

    if (record.codeChallenge) {
      const method = (record.codeChallengeMethod || 'S256').toUpperCase();
      if (method !== 'S256') {
        json(res, 400, { error: 'invalid_request', error_description: 'Unsupported code_challenge_method' });
        return true;
      }
      if (!codeVerifier) {
        json(res, 400, { error: 'invalid_request', error_description: 'Missing code_verifier' });
        return true;
      }
      const expected = sha256Base64Url(codeVerifier);
      if (expected !== record.codeChallenge) {
        json(res, 400, { error: 'invalid_grant' });
        return true;
      }
    }

    const exp = supabaseJwtSecret ? verifySupabaseJwt(record.supabaseAccessToken, supabaseJwtSecret)?.exp : undefined;
    const expiresIn = exp ? Math.max(0, Math.floor(exp - Date.now() / 1000)) : 3600;

    json(res, 200, {
      access_token: record.supabaseAccessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: record.scope,
    });
    return true;
  }

  // JWKS (not actually used by this minimal flow, but referenced by OIDC discovery)
  if (pathname === '/oauth/jwks.json' && req.method === 'GET') {
    json(res, 200, { keys: [] });
    return true;
  }

  return false;
}

/**
 * Handle SSE connection requests
 */
async function handleSseRequest(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  let sessionId: string | undefined;
  let server: Server | undefined;
  let transport: SSEServerTransport | undefined;
  try {
    server = createMonekoServer();
    transport = new SSEServerTransport(postPath, res);
    sessionId = transport.sessionId;

    sessions.set(sessionId, { server, transport });

    logger.info({ sessionId }, 'New SSE session established');

    transport.onclose = async () => {
      if (sessionId) sessions.delete(sessionId);
      logger.info({ sessionId }, 'SSE session closed');
    };

    transport.onerror = (error) => {
      logger.error({ error, sessionId }, 'SSE transport error');
    };

    await server.connect(transport);
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to start SSE session');
    if (sessionId) sessions.delete(sessionId);
    if (!res.headersSent) {
      res.writeHead(500).end('Failed to establish SSE connection');
    }
  }
}
/**
 * Handle POST message requests
 */
async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const requested = (req.headers['access-control-request-headers'] as string) ||
    'content-type, authorization, openai-conversation-id, openai-ephemeral-user-id, mcp-session-id';
  res.setHeader('Access-Control-Allow-Headers', requested);
  res.setHeader('Vary', 'Access-Control-Request-Headers');

  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    res.writeHead(400).end('Missing sessionId query parameter');
    return;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    res.writeHead(404).end('Unknown session');
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to process message');
    if (!res.headersSent) {
      res.writeHead(500).end('Failed to process message');
    }
  }
}

/**
 * Main HTTP server
 */
const portEnv = Number(process.env.PORT ?? 8000);
const port = Number.isFinite(portEnv) ? portEnv : 8000;
const host = process.env.HOST ?? '127.0.0.1';

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400).end('Missing URL');
      return;
    }

    setLastPublicBaseUrl(guessBaseUrl(req));

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    if (await handleOAuth(req, res, url)) {
      return;
    }

    // Serve built widget assets (JS/CSS/etc) for ChatGPT widget iframes.
    if (url.pathname.startsWith(assetsPrefix)) {
      if (!fs.existsSync(webDistDir)) {
        logger.warn({ webDistDir }, 'Widget assets directory missing; did you run `pnpm --filter web build`?');
        res.writeHead(404).end('Assets Not Found');
        return;
      }
      serveAsset(req, res, url);
      return;
    }

    // No OAuth/OpenID discovery endpoints for MVP: treat as plain MCP server

    // Handle CORS preflight (match official examples)
    if (
      req.method === 'OPTIONS' &&
      (url.pathname === ssePath || url.pathname === postPath)
    ) {
      const requested = (req.headers['access-control-request-headers'] as string) ||
        'content-type, authorization, openai-conversation-id, openai-ephemeral-user-id, mcp-session-id';
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': requested,
        'Access-Control-Max-Age': '600',
        'Vary': 'Access-Control-Request-Headers',
      });
      res.end();
      return;
    }

    // Serve minimal well-known and favicon endpoints to satisfy client probes (no auth)
    if (req.method === 'GET') {
      const p = url.pathname;
      const normalize = (path: string) => {
        // Strip optional leading /mcp and optional trailing /mcp
        let v = path.replace(/^\/mcp\//, '/');
        v = v.replace(/\/(mcp|MCP)$/,'');
        return v;
      };
      const n = normalize(p);

      // ChatGPT may probe OAuth/OIDC discovery endpoints even if you choose "No Auth".
      // Return minimal discovery documents so connector creation succeeds.
      if (
        n === '/.well-known/openid-configuration' ||
        n === '/.well-known/oauth-authorization-server' ||
        n === '/.well-known/oauth-protected-resource'
      ) {
        const baseUrl = guessBaseUrl(req).replace(/\/+$/, '');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);

        if (n === '/.well-known/openid-configuration') {
          res.end(
            JSON.stringify({
              issuer: baseUrl,
              authorization_endpoint: `${baseUrl}/oauth/authorize`,
              token_endpoint: `${baseUrl}/oauth/token`,
              registration_endpoint: `${baseUrl}/oauth/register`,
              jwks_uri: `${baseUrl}/oauth/jwks.json`,
              response_types_supported: ['code'],
              subject_types_supported: ['public'],
              id_token_signing_alg_values_supported: ['RS256'],
              code_challenge_methods_supported: ['S256'],
            })
          );
          return;
        }

        if (n === '/.well-known/oauth-authorization-server') {
          res.end(
            JSON.stringify({
              issuer: baseUrl,
              authorization_endpoint: `${baseUrl}/oauth/authorize`,
              token_endpoint: `${baseUrl}/oauth/token`,
              registration_endpoint: `${baseUrl}/oauth/register`,
              response_types_supported: ['code'],
              grant_types_supported: ['authorization_code'],
              token_endpoint_auth_methods_supported: ['none'],
              code_challenge_methods_supported: ['S256'],
            })
          );
          return;
        }

        res.end(
          JSON.stringify({
            resource: `${baseUrl}/mcp`,
            authorization_servers: [`${baseUrl}`],
          })
        );
        return;
      }
      if (p === '/favicon.ico' || p === '/favicon.svg') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    // Streamable HTTP transport (modern) on /mcp
    if (url.pathname === ssePath && (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

      const sessionIdHeader = (req.headers['mcp-session-id'] as string | undefined) || (req.headers['Mcp-Session-Id'] as string | undefined);

      if (req.method === 'POST') {
        try {
          if (sessionIdHeader) {
            const session = streamSessions.get(sessionIdHeader);
            if (!session) {
              res.writeHead(404).end('Unknown session');
              return;
            }
            ensureAcceptHeader(req);
            await session.transport.handleRequest(req as any, res as any);
            return;
          }
          // Buffer and parse JSON body for initialization
          const chunks: Buffer[] = [];
          await new Promise<void>((resolve) => {
            req
              .on('data', (c) => chunks.push(c))
              .on('end', resolve)
              .on('error', resolve);
          });
          const raw = Buffer.concat(chunks).toString('utf8') || '{}';
          let body: any = {};
          try { body = JSON.parse(raw); } catch {}

          // Be lenient: if clientInfo is missing on initialize, inject a default per spec
          if (body && body.method === 'initialize' && body.params) {
            body.params = body.params || {};
            if (!body.params.clientInfo) {
              body.params.clientInfo = { name: 'unknown-client', version: '0.0.0' };
            }
          }

          // New streamable session (first POST for this client)
          const server = createMonekoServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true,
            onsessioninitialized: (sessionId: string) => {
              streamSessions.set(sessionId, { server, transport });
              logger.info({ sessionId }, 'New Streamable HTTP session initialized');
            },
          });
          transport.onclose = async () => {
            const id = transport.sessionId;
            if (id) streamSessions.delete(id);
            logger.info({ sessionId: transport.sessionId }, 'Streamable HTTP session closed');
          };

          await server.connect(transport);
          ensureAcceptHeader(req);
          ensureJsonContentType(req);
          await transport.handleRequest(req as any, res as any, body);
          return;
        } catch (error) {
          logger.error({ error }, 'Streamable HTTP POST handling failed');
          if (!res.headersSent) {
            res.writeHead(500).end('Failed to process MCP request');
          }
          return;
        }
      }

      if (req.method === 'GET' || req.method === 'DELETE') {
        if (sessionIdHeader) {
          const session = streamSessions.get(sessionIdHeader);
          if (!session) {
            res.writeHead(404).end('Unknown session');
            return;
          }
          try {
            ensureAcceptHeader(req);
            await session.transport.handleRequest(req as any, res as any);
            return;
          } catch (error) {
            logger.error({ error }, 'Streamable HTTP notification/close failed');
            if (!res.headersSent) {
              res.writeHead(500).end('Failed to process MCP request');
            }
            return;
          }
        }
        // No session header -> treat as legacy SSE
        if (req.method === 'GET') {
          await handleSseRequest(res);
          return;
        }
      }
    }

    // SSE stream endpoint (fallback)
    if (req.method === 'GET' && url.pathname === ssePath) {
      await handleSseRequest(res);
      return;
    }

    // Legacy SSE POST message endpoint
    if (req.method === 'POST' && url.pathname === postPath) {
      await handlePostMessage(req, res, url);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Moneko MCP server OK');
      return;
    }

    res.writeHead(404).end('Not Found');
  }
);

httpServer.on('clientError', (err: Error, socket) => {
  logger.error({ error: err }, 'HTTP client error');
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

httpServer.listen(port, host, () => {
  logger.info({ port, host }, 'Moneko MCP server started');
  logger.info(`  SSE stream: GET http://${host}:${port}${ssePath}`);
  logger.info(`  Message post endpoint: POST http://${host}:${port}${postPath}?sessionId=...`);
  logger.info(`  Environment: EDGE_BASE_URL=${process.env.EDGE_BASE_URL}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down server...');
  httpServer.close(() => {
    logger.info('Server shutdown complete');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Shutting down server...');
  httpServer.close(() => {
    logger.info('Server shutdown complete');
    process.exit(0);
  });
});
