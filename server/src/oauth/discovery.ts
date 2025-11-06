/**
 * OAuth 2.1 Discovery Endpoints
 *
 * Implements RFC 8414 OAuth Authorization Server Metadata and
 * Protected Resource Metadata endpoints, as well as the
 * OpenID Provider Configuration (OIDC discovery).
 *
 * These endpoints tell ChatGPT:
 * 1. Where your Supabase authorization server is located
 * 2. What OAuth flows are supported (authorization code + PKCE)
 * 3. What scopes are available for this MCP server
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthorizationServerMetadata, ProtectedResourceMetadata } from './types.js';
import { logger } from '../lib/logger.js';

/**
 * Get Supabase project URL from environment
 */
function getSupabaseUrl(): string {
  const edgeBaseUrl = process.env.EDGE_BASE_URL;
  if (!edgeBaseUrl) {
    throw new Error('EDGE_BASE_URL environment variable is required for OAuth');
  }

  // Extract Supabase project URL from edge function URL
  // Example: https://qbuynyxyemigtnvdujts.supabase.co/functions/v1/...
  // -> https://qbuynyxyemigtnvdujts.supabase.co
  try {
    const url = new URL(edgeBaseUrl);
    return `${url.protocol}//${url.hostname}`;
  } catch (error) {
    logger.error({ error, edgeBaseUrl }, 'Invalid EDGE_BASE_URL format');
    throw new Error('Invalid EDGE_BASE_URL format');
  }
}

/**
 * Generate OAuth 2.1 Authorization Server Metadata
 * Spec: RFC 8414 Section 2
 */
export function getAuthorizationServerMetadata(): AuthorizationServerMetadata {
  const supabaseUrl = getSupabaseUrl();
  const issuer = `${supabaseUrl}/auth/v1`;

  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${supabaseUrl}/.well-known/jwks.json`,
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
    ],
    response_types_supported: [
      'code',
    ],
    scopes_supported: [
      'openid',
      'profile',
      'email',
      'budget:read',
      'budget:write',
      'expenses:read',
      'expenses:write',
    ],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none', // For PKCE with public clients
    ],
    code_challenge_methods_supported: [
      'S256', // SHA-256 (required for OAuth 2.1)
    ],
  };
}

/**
 * Generate OpenID Provider Configuration (OIDC discovery)
 * Spec: OpenID Connect Discovery 1.0, Section 4
 */
export function getOpenIdProviderConfiguration() {
  const supabaseUrl = getSupabaseUrl();
  const issuer = `${supabaseUrl}/auth/v1`;

  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${supabaseUrl}/.well-known/jwks.json`,
    response_types_supported: [
      'code',
    ],
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
    ],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: [
      'openid',
      'profile',
      'email',
      'budget:read',
      'budget:write',
      'expenses:read',
      'expenses:write',
    ],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none',
    ],
    code_challenge_methods_supported: ['S256'],
  } as const;
}

/**
 * Generate OAuth Protected Resource Metadata
 * Spec: RFC 8414 Section 3
 */
export function getProtectedResourceMetadata(): ProtectedResourceMetadata {
  const supabaseUrl = getSupabaseUrl();
  const issuer = `${supabaseUrl}/auth/v1`;

  return {
    resource: 'moneko-mcp',
    authorization_servers: [issuer],
    scopes_supported: [
      'openid',
      'profile',
      'email',
      'budget:read',
      'budget:write',
      'expenses:read',
      'expenses:write',
    ],
    bearer_methods_supported: [
      'header', // Authorization: Bearer <token>
    ],
  };
}

/**
 * Handle OAuth discovery endpoint requests
 */
export function handleOAuthDiscovery(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  // Set CORS headers for ChatGPT access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  try {
    let metadata: AuthorizationServerMetadata | ProtectedResourceMetadata;

    // Support both root-level and path-qualified variants (e.g., /mcp/.well-known/...)
    const normalized = pathname
      .replace(/^\/mcp\/(\.well-known\/.*)$/, '/$1')
      .replace(/^(\.well-known\/.*)$/, '/$1')
      .replace(/\/+$/, '');

    if (normalized === '/.well-known/oauth-authorization-server' ||
        normalized === '/.well-known/oauth-authorization-server/mcp') {
      // Authorization Server Metadata (RFC 8414 Section 2)
      metadata = getAuthorizationServerMetadata();
      logger.info('Served OAuth authorization server metadata');
    } else if (normalized === '/.well-known/oauth-protected-resource' ||
               normalized === '/.well-known/oauth-protected-resource/mcp') {
      // Protected Resource Metadata (RFC 8414 Section 3)
      metadata = getProtectedResourceMetadata();
      logger.info('Served OAuth protected resource metadata');
    } else if (normalized === '/.well-known/openid-configuration' ||
               normalized === '/.well-known/openid-configuration/mcp') {
      // OpenID Provider Configuration (OIDC discovery)
      const config = getOpenIdProviderConfiguration();
      res.writeHead(200);
      res.end(JSON.stringify(config, null, 2));
      return;
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify(metadata, null, 2));
  } catch (error) {
    logger.error({ error, pathname }, 'Failed to serve OAuth discovery endpoint');
    res.writeHead(500);
    res.end(JSON.stringify({
      error: 'server_error',
      error_description: 'Failed to generate OAuth metadata',
    }));
  }
}
