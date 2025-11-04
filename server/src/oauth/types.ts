/**
 * OAuth 2.1 Type Definitions
 *
 * Following OpenAI's OAuth integration pattern for persistent user authentication
 * across ChatGPT conversations.
 */

/**
 * Parsed access token with user identity
 */
export interface AccessToken {
  /** Stable user identifier from JWT 'sub' claim */
  subject: string;
  /** Token issuer (Supabase auth URL) */
  issuer: string;
  /** Scopes granted to this token */
  scopes: string[];
  /** Token expiration timestamp (Unix seconds) */
  expiresAt: number;
  /** Raw JWT token string */
  raw: string;
}

/**
 * OAuth Authorization Server Metadata (RFC 8414)
 * Returned at /.well-known/oauth-authorization-server
 */
export interface AuthorizationServerMetadata {
  /** OAuth 2.0 Authorization Server Issuer identifier */
  issuer: string;
  /** URL of the authorization endpoint */
  authorization_endpoint: string;
  /** URL of the token endpoint */
  token_endpoint: string;
  /** URL of the JSON Web Key Set document */
  jwks_uri: string;
  /** URL of the dynamic client registration endpoint (RFC 7591) - optional */
  registration_endpoint?: string;
  /** List of OAuth 2.0 grant types supported */
  grant_types_supported: string[];
  /** List of OAuth 2.0 response types supported */
  response_types_supported: string[];
  /** List of OAuth 2.0 scopes supported */
  scopes_supported: string[];
  /** List of client authentication methods supported */
  token_endpoint_auth_methods_supported: string[];
  /** List of PKCE code challenge methods supported */
  code_challenge_methods_supported: string[];
}

/**
 * OAuth Protected Resource Metadata (RFC 8414)
 * Returned at /.well-known/oauth-protected-resource
 */
export interface ProtectedResourceMetadata {
  /** Protected resource server identifier */
  resource: string;
  /** OAuth 2.0 Authorization Server Issuer identifier */
  authorization_servers: string[];
  /** List of scopes required/supported by this resource */
  scopes_supported?: string[];
  /** Bearer token usage methods supported */
  bearer_methods_supported?: string[];
}

/**
 * JWT Header structure
 */
export interface JWTHeader {
  /** Algorithm used for signing (e.g., RS256, HS256) */
  alg: string;
  /** Token type (always "JWT") */
  typ: string;
  /** Key ID used for signing */
  kid?: string;
}

/**
 * JWT Payload (Claims)
 */
export interface JWTPayload {
  /** Subject - stable user identifier */
  sub: string;
  /** Issuer - Supabase auth server URL */
  iss: string;
  /** Audience - intended recipient of token */
  aud?: string | string[];
  /** Expiration time (Unix timestamp) */
  exp: number;
  /** Issued at time (Unix timestamp) */
  iat: number;
  /** Email address (Supabase specific) */
  email?: string;
  /** Email verification status (Supabase specific) */
  email_verified?: boolean;
  /** User role (Supabase specific) */
  role?: string;
  /** Session ID (Supabase specific) */
  session_id?: string;
  /** Additional claims */
  [key: string]: unknown;
}

/**
 * JSON Web Key (JWK) structure
 */
export interface JWK {
  /** Key type (e.g., "RSA") */
  kty: string;
  /** Key usage (e.g., "sig" for signature) */
  use: string;
  /** Key ID */
  kid: string;
  /** Algorithm (e.g., "RS256") */
  alg: string;
  /** RSA public exponent (base64url) */
  e?: string;
  /** RSA modulus (base64url) */
  n?: string;
}

/**
 * JSON Web Key Set (JWKS)
 */
export interface JWKS {
  /** Array of JSON Web Keys */
  keys: JWK[];
}

/**
 * OAuth error response
 */
export interface OAuthError {
  /** Error code (e.g., "invalid_token", "insufficient_scope") */
  error: string;
  /** Human-readable error description */
  error_description?: string;
  /** URI to error documentation */
  error_uri?: string;
}

/**
 * Token verification options
 */
export interface TokenVerificationOptions {
  /** Expected issuer URL */
  issuer: string;
  /** Expected audience (optional) */
  audience?: string;
  /** Clock skew tolerance in seconds (default: 60) */
  clockSkew?: number;
  /** Required scopes (all must be present) */
  requiredScopes?: string[];
}
