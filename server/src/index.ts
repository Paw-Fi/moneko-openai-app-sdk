import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import dotenv from 'dotenv';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMonekoServer } from './server.js';
import { logger } from './lib/logger.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Load environment variables
dotenv.config();

type SessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();

const ssePath = '/mcp';
const postPath = '/mcp/messages';

/**
 * Handle SSE connection requests
 */
async function handleSseRequest(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

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
      if (server) await server.close();
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
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

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

    // Handle CORS preflight
    if (
      req.method === 'OPTIONS' &&
      (url.pathname === ssePath || url.pathname === postPath)
    ) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      });
      res.end();
      return;
    }

    // SSE endpoint
    if (req.method === 'GET' && url.pathname === ssePath) {
      await handleSseRequest(res);
      return;
    }

    // POST message endpoint
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
