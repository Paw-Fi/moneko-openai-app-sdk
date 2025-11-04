/**
 * OAuth 2.1 Authentication Module
 *
 * Provides persistent user authentication for ChatGPT MCP integration.
 *
 * Exports:
 * - Discovery endpoints (RFC 8414)
 * - JWT token verification (Supabase Auth)
 * - Type definitions
 */

export * from './types.js';
export * from './discovery.js';
export * from './verifier.js';
