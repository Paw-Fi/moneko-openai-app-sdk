/**
 * JWT Token Verification for Supabase Auth
 *
 * Validates JWT access tokens issued by Supabase Auth, following OAuth 2.1
 * best practices for token verification.
 *
 * Key features:
 * - Fetches and caches Supabase JWKS (JSON Web Key Set)
 * - Verifies JWT signature using RS256 algorithm
 * - Validates standard claims (iss, aud, exp, iat)
 * - Extracts stable user ID from 'sub' claim
 * - Handles clock skew and token expiration
 */

import type {
  AccessToken,
  JWTHeader,
  JWTPayload,
  JWKS,
  JWK,
  TokenVerificationOptions,
} from './types.js';
import { logger } from '../lib/logger.js';

/**
 * Base64URL decode helper
 */
function base64UrlDecode(input: string): string {
  // Replace URL-safe characters
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padding = base64.length % 4;
  if (padding === 2) base64 += '==';
  else if (padding === 3) base64 += '=';

  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Parse JWT without verification (for header/payload extraction)
 */
function parseJWT(token: string): { header: JWTHeader; payload: JWTPayload } {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0])) as JWTHeader;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as JWTPayload;

    return { header, payload };
  } catch (error) {
    logger.error({ error }, 'Failed to parse JWT');
    throw new Error('Invalid JWT structure');
  }
}

/**
 * Supabase Token Verifier
 *
 * Handles JWT verification for Supabase Auth tokens using JWKS.
 */
export class SupabaseTokenVerifier {
  private jwksCache: JWKS | null = null;
  private jwksCacheExpiry = 0;
  private readonly jwksCacheTTL = 3600000; // 1 hour in milliseconds

  constructor(
    private readonly options: TokenVerificationOptions
  ) {}

  /**
   * Fetch JWKS from Supabase
   */
  private async fetchJWKS(): Promise<JWKS> {
    const now = Date.now();

    // Return cached JWKS if still valid
    if (this.jwksCache && now < this.jwksCacheExpiry) {
      return this.jwksCache;
    }

    try {
      // Extract Supabase URL from issuer
      const issuerUrl = new URL(this.options.issuer);
      const supabaseUrl = `${issuerUrl.protocol}//${issuerUrl.hostname}`;
      const jwksUrl = `${supabaseUrl}/.well-known/jwks.json`;

      logger.debug({ jwksUrl }, 'Fetching JWKS');

      const response = await fetch(jwksUrl);

      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status} ${response.statusText}`);
      }

      const jwks = (await response.json()) as JWKS;

      // Cache the JWKS
      this.jwksCache = jwks;
      this.jwksCacheExpiry = now + this.jwksCacheTTL;

      logger.info({ keyCount: jwks.keys.length }, 'JWKS fetched and cached');

      return jwks;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch JWKS');
      throw new Error('Failed to fetch JWKS from Supabase');
    }
  }

  /**
   * Find JWK by key ID
   */
  private async findJWK(kid: string): Promise<JWK | null> {
    const jwks = await this.fetchJWKS();
    return jwks.keys.find((key) => key.kid === kid) || null;
  }

  /**
   * Verify JWT signature using RS256 algorithm
   */
  private async verifySignature(token: string, header: JWTHeader): Promise<boolean> {
    // Only RS256 is supported by Supabase
    if (header.alg !== 'RS256') {
      logger.warn({ alg: header.alg }, 'Unsupported JWT algorithm');
      return false;
    }

    if (!header.kid) {
      logger.warn('JWT missing kid (key ID) in header');
      return false;
    }

    try {
      const jwk = await this.findJWK(header.kid);

      if (!jwk) {
        logger.warn({ kid: header.kid }, 'JWK not found for kid');
        return false;
      }

      // Import JWK and verify signature using Web Crypto API
      const { createPublicKey, verify } = await import('node:crypto');

      // Convert JWK to PEM format for Node.js crypto
      // Cast to JsonWebKey for Node.js compatibility
      const publicKey = createPublicKey({
        key: jwk as any,
        format: 'jwk',
      });

      // Split JWT into parts
      const [headerB64, payloadB64, signatureB64] = token.split('.');
      const message = `${headerB64}.${payloadB64}`;

      // Decode signature from base64url
      const signature = Buffer.from(
        signatureB64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      );

      // Verify signature
      const isValid = verify('RSA-SHA256', Buffer.from(message), publicKey, signature);

      return isValid;
    } catch (error) {
      logger.error({ error }, 'Signature verification failed');
      return false;
    }
  }

  /**
   * Validate JWT claims
   */
  private validateClaims(payload: JWTPayload): boolean {
    const now = Math.floor(Date.now() / 1000);
    const clockSkew = this.options.clockSkew || 60;

    // Validate issuer
    if (payload.iss !== this.options.issuer) {
      logger.warn({ expected: this.options.issuer, actual: payload.iss }, 'Invalid issuer');
      return false;
    }

    // Validate audience (if specified)
    if (this.options.audience) {
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!audiences.includes(this.options.audience)) {
        logger.warn({ expected: this.options.audience, actual: payload.aud }, 'Invalid audience');
        return false;
      }
    }

    // Validate expiration with clock skew
    if (payload.exp && payload.exp + clockSkew < now) {
      logger.warn({ exp: payload.exp, now }, 'Token expired');
      return false;
    }

    // Validate issued at (not in the future)
    if (payload.iat && payload.iat - clockSkew > now) {
      logger.warn({ iat: payload.iat, now }, 'Token issued in the future');
      return false;
    }

    // Validate subject exists
    if (!payload.sub) {
      logger.warn('Token missing subject (sub) claim');
      return false;
    }

    return true;
  }

  /**
   * Extract scopes from token payload
   */
  private extractScopes(payload: JWTPayload): string[] {
    // Supabase doesn't include scopes in JWT by default
    // This can be extended to check user metadata or custom claims
    const scopes: string[] = ['openid', 'profile', 'email'];

    // Check if user is authenticated (has email verified)
    if (payload.email_verified) {
      scopes.push('budget:read', 'budget:write', 'expenses:read', 'expenses:write');
    }

    return scopes;
  }

  /**
   * Verify access token and extract user identity
   *
   * @param token - JWT access token from Authorization header
   * @returns AccessToken with user identity, or null if invalid
   */
  async verifyToken(token: string): Promise<AccessToken | null> {
    try {
      // Parse JWT structure
      const { header, payload } = parseJWT(token);

      // Verify signature
      const signatureValid = await this.verifySignature(token, header);
      if (!signatureValid) {
        logger.warn('Token signature verification failed');
        return null;
      }

      // Validate claims
      const claimsValid = this.validateClaims(payload);
      if (!claimsValid) {
        logger.warn('Token claims validation failed');
        return null;
      }

      // Check required scopes
      const tokenScopes = this.extractScopes(payload);
      if (this.options.requiredScopes) {
        const hasRequiredScopes = this.options.requiredScopes.every((scope) =>
          tokenScopes.includes(scope)
        );

        if (!hasRequiredScopes) {
          logger.warn(
            { required: this.options.requiredScopes, actual: tokenScopes },
            'Insufficient scopes'
          );
          return null;
        }
      }

      // Token is valid - return AccessToken with stable user ID
      logger.info({ userId: payload.sub, email: payload.email }, 'Token verified successfully');

      return {
        subject: payload.sub, // Stable user ID for Supabase
        issuer: payload.iss,
        scopes: tokenScopes,
        expiresAt: payload.exp,
        raw: token,
      };
    } catch (error) {
      logger.error({ error }, 'Token verification error');
      return null;
    }
  }

  /**
   * Extract token from Authorization header
   *
   * @param authHeader - Authorization header value (e.g., "Bearer eyJ...")
   * @returns Token string, or null if invalid format
   */
  static extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
  }
}

/**
 * Create token verifier instance for Supabase
 */
export function createSupabaseVerifier(): SupabaseTokenVerifier {
  const edgeBaseUrl = process.env.EDGE_BASE_URL;

  if (!edgeBaseUrl) {
    throw new Error('EDGE_BASE_URL environment variable is required for OAuth');
  }

  // Extract Supabase URL and construct issuer
  try {
    const url = new URL(edgeBaseUrl);
    const supabaseUrl = `${url.protocol}//${url.hostname}`;
    const issuer = `${supabaseUrl}/auth/v1`;

    return new SupabaseTokenVerifier({
      issuer,
      clockSkew: 60, // 60 second clock skew tolerance
      requiredScopes: ['openid'], // Minimum required scope
    });
  } catch (error) {
    logger.error({ error, edgeBaseUrl }, 'Invalid EDGE_BASE_URL format');
    throw new Error('Invalid EDGE_BASE_URL format');
  }
}
