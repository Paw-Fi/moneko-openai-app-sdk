import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import dotenv from 'dotenv';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMonekoServer } from './server.js';
import { logger } from './lib/logger.js';
import { handleOAuthDiscovery } from './oauth/discovery.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Load environment variables
dotenv.config();

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

/**
 * Handle SSE connection requests
 */
async function handleSseRequest(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
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
  // Echo requested headers for CORS preflight compatibility with ChatGPT
  const requested = (req.headers['access-control-request-headers'] as string) ||
    'content-type, authorization, openai-conversation-id, openai-ephemeral-user-id';
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

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400).end('Missing URL');
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    // OAuth discovery endpoints (RFC 8414) - for per-tool authentication
    if (req.method === 'GET' && url.pathname.startsWith('/.well-known/oauth-')) {
      handleOAuthDiscovery(req, res, url.pathname);
      return;
    }

    // Handle CORS preflight
    if (
      req.method === 'OPTIONS' &&
      (url.pathname === ssePath || url.pathname === postPath)
    ) {
      const requested = (req.headers['access-control-request-headers'] as string) ||
        'content-type, authorization, openai-conversation-id, openai-ephemeral-user-id';
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': requested,
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }

    // Streamable HTTP transport (modern) on /mcp.
    // For GET/DELETE we only treat as streamable when the Mcp-Session-Id header is present.
    if (url.pathname === ssePath && (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE')) {
      // Configure common CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

      const sessionIdHeader = (req.headers['mcp-session-id'] as string | undefined) || (req.headers['Mcp-Session-Id'] as string | undefined);

      if (req.method === 'POST') {
        try {
          if (sessionIdHeader && streamSessions.has(sessionIdHeader)) {
            const { transport } = streamSessions.get(sessionIdHeader)!;
            await transport.handleRequest(req as any, res as any);
            return;
          }

          // Buffer body for initialize detection
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

          if (!isInitializeRequest(body)) {
            res.writeHead(400).end('Bad Request: No valid session ID provided');
            return;
          }

          // New streamable session
          const server = createMonekoServer();

          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
            onsessioninitialized: (sessionId: string) => {
              streamSessions.set(sessionId, { server, transport });
              logger.info({ sessionId }, 'New Streamable HTTP session initialized');
            },
          });
          transport.onclose = async () => {
            const id = transport.sessionId;
            if (id) streamSessions.delete(id);
            await server.close?.();
            logger.info({ sessionId: transport.sessionId }, 'Streamable HTTP session closed');
          };

          await server.connect(transport);
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
        if (sessionIdHeader && streamSessions.has(sessionIdHeader)) {
          const { transport } = streamSessions.get(sessionIdHeader)!;
          try {
            await transport.handleRequest(req as any, res as any);
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

    // Legacy SSE POST message endpoint
    if (req.method === 'POST' && url.pathname === postPath) {
      await handlePostMessage(req, res, url);
      return;
    }

    res.writeHead(404).end('Not Found');
  }
);

httpServer.on('clientError', (err: Error, socket) => {
  logger.error({ error: err }, 'HTTP client error');
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

httpServer.listen(port, () => {
  logger.info({ port }, 'Moneko MCP server started');
  logger.info(`  SSE stream: GET http://localhost:${port}${ssePath}`);
  logger.info(`  Message post endpoint: POST http://localhost:${port}${postPath}?sessionId=...`);
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
