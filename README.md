# Moneko OpenAI App SDK

The Moneko OpenAI App SDK provides a complete implementation of an OpenAI Apps SDK (Model Context Protocol, MCP) integration for **Moneko AI** — an intelligent budgeting and expense management assistant that operates directly within ChatGPT.

This repository demonstrates how to connect a real-world product backend (Supabase Edge functions) to OpenAI’s new Apps SDK, providing structured, interactive widgets for financial insights and data entry.

---

## Overview

This project enables ChatGPT users to interact with Moneko using natural language while receiving structured visual responses. The SDK bridges OpenAI’s runtime to Moneko’s budgeting backend through a secure and well-defined MCP server.

**Key capabilities:**
- Natural-language expense logging and budgeting.
- Real-time budget pacing and spending summaries.
- Transaction table views rendered as embedded widgets.
- Guest identity management and upgrade flows.
- Compliance-grade privacy and data handling.

---

## Architecture

The repository is divided into three main parts:

```
@ moneko-openai-app-sdk
├── server/      # Node MCP server (registers tools, handles proxying and transforms)
│   ├── src/
│   │   ├── tools/          # Each tool corresponds to a Supabase function
│   │   ├── lib/            # Proxy, transform, logger, error handling
│   │   ├── schemas.ts      # Input validation with Zod
│   │   ├── server.ts       # MCP server initialization
│   │   └── index.ts        # HTTP/SSE entrypoint
│   └── package.json
│
├── web/         # React-based widget bundle (compiled to static HTML)
│   ├── src/components/     # BudgetStatusCard, ExpenseTableCompact, etc.
│   ├── src/bridge.ts       # Interface to window.openai.callTool and openExternal
│   ├── dist/               # Generated widget HTML with CSP meta tags
│   └── package.json
│
└── docs/
    ├── gpt-actions-schema.json  # Supabase OpenAPI definitions for all endpoints
    └── IMPLEMENTATION_ADDENDUM.md  # Full specification of behavior and contracts
```

---

## How it Works

1. **User Interaction in ChatGPT**
   - A user asks a budgeting question in ChatGPT (e.g., “Show my expenses this month”).
   - The OpenAI runtime decides which Moneko tool to invoke (for example, `moneko.expense_summary`).

2. **MCP Server Tool Call**
   - The MCP server receives the request through its `/mcp/messages` endpoint.
   - It validates input with Zod schemas and proxies the call to Moneko’s Supabase Edge function.
   - The Supabase response is transformed into structured widget props.

3. **Widget Rendering**
   - The MCP server registers widget templates (HTML resources) that OpenAI renders as secure iframes.
   - The model provides `structuredContent` with props that hydrate components like `BudgetStatusCard` or `ExpenseTableCompact`.

4. **Bridge Calls**
   - Widget components use `window.openai.callTool` to trigger further actions (set budget, edit expense, delete expense, etc.).
   - Sensitive operations always route through the MCP server; widgets never contact Supabase directly.

5. **Privacy and Security**
   - Guest identities are deterministic (based on OpenAI conversation IDs).
   - No personal tokens or API keys are embedded in widgets.
   - Each widget enforces strict Content Security Policy (CSP) headers.

---

## MCP Server Responsibilities

- Expose an SSE transport at `/mcp` and a POST backchannel at `/mcp/messages`.
- Register all Moneko tools, including:
  - `moneko.get_budget`
  - `moneko.set_budget`
  - `moneko.save_expense`
  - `moneko.list_expenses`
  - `moneko.expense_summary`
  - `moneko.update_expense`
  - `moneko.delete_expense`
  - `moneko.start_auth`
  - `moneko.start_upgrade`
- Forward identity headers (`OpenAI-Conversation-Id`, `OpenAI-Ephemeral-User-Id`) to Supabase.
- Return structured JSON in the form:

```json
{
  "structuredContent": {
    "component": "BudgetStatusCard",
    "props": { ... }
  },
  "content": [
    { "type": "text", "text": "Here’s your current budget status." }
  ]
}
```

---

## Widget Runtime

Widgets are small, self-contained React apps compiled to static HTML and hosted as MCP resources.

**Available widgets:**
- `BudgetStatusCard.html` — displays daily budget and projections.
- `CategoryBreakdown.html` — visual summary of spending by category.
- `ExpenseTable.html` — compact transaction list with edit/delete modals.
- `PrivacyPopover.html` — transparency statement required for review.

Each widget:
- Uses the `window.openai` bridge to invoke MCP tools.
- Never stores secrets or performs direct network requests.
- Includes a strict `<meta http-equiv="Content-Security-Policy">`.
- Renders correctly in both desktop and mobile ChatGPT clients.

---

## Security and Privacy Principles

- **No secrets in client code:** All API keys are stored server-side only.
- **Deterministic guest identity:** Guests are resolved using synthetic emails like `gpt-{conversationId}@guest.moneko`.
- **CSP enforcement:** Widgets cannot load external resources or scripts.
- **Transparency:** Every widget displays clear privacy messaging and allows users to edit or delete entries.
- **Compliance:** Widgets use conditional phrasing (“at this pace”) and avoid predictive or investment statements.

---

## Testing and Validation

Before submission to OpenAI, all components must pass the following gates:

1. **Backend contract tests**
   - Each endpoint returns structured JSON with `Accept: application/json`.
   - Guest identity creation works deterministically.
   - Household data excluded from GPT-mode summaries.

2. **MCP server tests**
   - Zod input validation and error normalization verified.
   - Transforms correctly convert cents to major units.
   - Structured content matches widget props.

3. **Widget runtime tests**
   - Components render correctly using mock `window.openai` functions.
   - Modals trigger correct tool calls and refresh data.
   - PrivacyPopover appears in all widgets.

4. **Security checks**
   - No secrets or tokens in built assets.
   - All HTML includes compliant CSP directives.

---

## Development Setup

**Requirements**
- Node.js 18+
- pnpm or npm
- Supabase project and API key for backend testing

**Setup**

```bash
# Clone the repository
git clone https://github.com/moneko-ai/moneko-openai-app-sdk.git
cd moneko-openai-app-sdk

# Install dependencies
pnpm install

# Environment configuration
cp server/.env.example server/.env
# Update EDGE_BASE_URL and EDGE_API_KEY

# Run the MCP server
pnpm --filter server dev

# Build the widgets
pnpm --filter web build
```

The MCP server will run locally (default port 8000) and can be tested using the [OpenAI MCP Inspector](https://github.com/openai/modelcontextprotocol).

---

## Related Documentation

- **IMPLEMENTATION_ADDENDUM.md** — engineering-level specification.
- **gpt-actions-schema.json** — OpenAPI definition of all Supabase endpoints.
- **OpenAI Apps SDK documentation:** [https://developers.openai.com/apps-sdk](https://developers.openai.com/apps-sdk)

---

## License

This project is licensed under the MIT License.  
Copyright © 2025 Moneko.

---

## Disclaimer

This project is an example of secure, privacy-conscious integration with the OpenAI Apps SDK.  
It does not provide financial or investment advice. All projections are conditional (“based on your current pace”) and purely informational.