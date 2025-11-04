# OAuth 2.1 Implementation Plan for Persistent ChatGPT Authentication

## **Goal**
Enable users to authenticate once with their Moneko account and maintain that identity across all ChatGPT conversations, ensuring their budget and expense data follows them everywhere.

---

## **What Needs to Be Done**

### **1. OAuth Discovery Endpoints**
**What**: Create standard OAuth 2.1 metadata endpoints that ChatGPT queries to find your authorization server
**Why**: ChatGPT needs to know where to send users for login and how to validate tokens
**Files to Create**:
- `src/oauth/discovery.ts` - OAuth metadata handler
- Update [src/index.ts](cci:7://file:///Users/charles/side-projects/Moneko/moneko-openai-app-sdk/server/src/index.ts:0:0-0:0) - Add discovery endpoint routes

### **2. Token Verification System** 
**What**: JWT token verification middleware that validates Supabase auth tokens
**Why**: Ensure every request comes from an authenticated user and extract their stable user ID
**Files to Create**:
- `src/oauth/verifier.ts` - JWT verification logic
- `src/oauth/types.ts` - OAuth types and interfaces

### **3. Server OAuth Configuration**
**What**: Configure MCP server to require OAuth for protected tools
**Why**: Tell ChatGPT which tools need authentication and what scopes are required
**Files to Modify**:
- [src/server.ts](cci:7://file:///Users/charles/side-projects/Moneko/moneko-openai-app-sdk/server/src/server.ts:0:0-0:0) - Add OAuth settings and security schemes

### **4. Tool Security Updates**
**What**: Add `securitySchemes` to each tool that needs authentication
**Why**: ChatGPT uses this to know when to trigger login flow
**Files to Modify**:
- [src/server.ts](cci:7://file:///Users/charles/side-projects/Moneko/moneko-openai-app-sdk/server/src/server.ts:0:0-0:0) - Update tool registrations

### **5. Supabase OAuth Configuration**
**What**: Configure Supabase Auth as OAuth 2.1 provider
**Why**: Enable dynamic client registration and proper scopes
**External Actions**:
- Supabase dashboard configuration
- Custom OAuth client registration

---

## **How to Implement - Step by Step**

### **Step 1: Create OAuth Discovery Handler**
```typescript
// src/oauth/discovery.ts
export function handleOAuthDiscovery(req: Request): Response {
  // Returns OAuth metadata at /.well-known/oauth-authorization-server
  // Returns protected resource metadata at /.well-known/oauth-protected-resource
  // Tells ChatGPT where your Supabase auth server is located
}
```

### **Step 2: Add Discovery Routes to Server**
```typescript
// src/index.ts - Add to your existing HTTP server
if (req.method === 'GET' && url.pathname.startsWith('/.well-known/')) {
  return handleOAuthDiscovery(req);
}
```

### **Step 3: Create JWT Verifier**
```typescript
// src/oauth/verifier.ts
export class SupabaseTokenVerifier {
  async verifyToken(token: string): Promise<AccessToken | null> {
    // 1. Fetch Supabase JWKS keys
    // 2. Validate JWT signature and claims
    // 3. Check issuer, audience, expiration
    // 4. Extract user ID from 'sub' claim (this is the stable identifier!)
    // 5. Return user info or null if invalid
  }
}
```

### **Step 4: Update Server Configuration**
```typescript
// src/server.ts - Modify createMonekoServer()
const server = new Server({
  name: 'moneko-mcp',
  version: '0.1.0',
}, {
  capabilities: {
    resources: {},
    tools: {},
  },
  // Add OAuth configuration
  auth: {
    issuerUrl: "https://qbuynyxyemigtnvdujts.supabase.co/auth/v1",
    tokenVerifier: new SupabaseTokenVerifier(),
    requiredScopes: ["openid", "profile"]
  }
});
```

### **Step 5: Add Security Schemes to Tools**
```typescript
// src/server.ts - Update each tool registration
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Extract and verify token from Authorization header
  const authHeader = request.meta?.headers?.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token) {
    throw new Error('Authentication required');
  }
  
  const user = await tokenVerifier.verifyToken(token);
  if (!user) {
    throw new Error('Invalid or expired token');
  }
  
  // Now proceed with tool logic using user.subject as stable user ID
});

// Register tools with security requirements
server.registerTool({
  name: 'moneko.get_budget',
  securitySchemes: [{ type: 'oauth2', scopes: ['budget:read'] }],
  // ... rest of tool config
});
```

---

## **The Complete Flow**

### **First Time User Connects**:
1. **ChatGPT queries** `/.well-known/oauth-protected-resource` → finds your Supabase auth server
2. **ChatGPT registers** as OAuth client with Supabase
3. **User invokes tool** (e.g., "set my budget to $50")
4. **ChatGPT redirects** user to `https://your-project.supabase.co/auth/v1/authorize`
5. **User logs in** with existing Moneko account or creates new one
6. **Supabase returns** authorization code to ChatGPT
7. **ChatGPT exchanges** code for access token
8. **ChatGPT calls** your tool with `Authorization: Bearer <token>` header
9. **Your server verifies** token, extracts stable user ID from `sub` claim
10. **Tool executes** with user's actual data

### **Subsequent Conversations**:
1. **User starts new chat**, says "show my budget"
2. **ChatGPT calls** your tool with stored access token
3. **Your server verifies** token, gets same `sub` claim
4. **User gets their data** - seamless continuity!

---

## **Key Benefits**

✅ **True Persistence**: User ID from JWT `sub` claim never changes
✅ **Proper Security**: Industry-standard OAuth 2.1 with PKCE
✅ **Existing Integration**: Uses your current Supabase users
✅ **Scoped Access**: Fine-grained permissions (read vs write)
✅ **ChatGPT Native**: Built exactly how OpenAI recommends

---

## **What You Get**

- **No more "guest" accounts** - users work with their real Moneko account
- **Cross-conversation continuity** - budget follows users everywhere
- **Enterprise-grade security** - proper token validation and scopes
- **Future-proof** - follows OpenAI's official authentication pattern

---

## **Implementation Priority**

1. **High Priority**: Discovery endpoints + basic token verification
2. **Medium Priority**: Tool security schemes + scope enforcement  
3. **Low Priority**: Advanced features like token refresh, rate limiting

**Would you like me to provide the complete code for any specific part of this implementation?**