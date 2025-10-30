# Moneko MCP Server

Model Context Protocol (MCP) server for the Moneko OpenAI App. This server acts as a secure proxy between OpenAI's Apps SDK and Moneko's Supabase Edge functions.

## Overview

The MCP server provides:

- **9 Tools** for expense tracking and budgeting
- **3 Widget Resources** for rich UI rendering
- **Secure Proxy** to Supabase Edge functions
- **Identity Management** via OpenAI conversation headers
- **Structured Data Transformation** for widget props

## Architecture

```
OpenAI ChatGPT
    ↓ (SSE + POST)
MCP Server (this package)
    ↓ (HTTP + headers)
Supabase Edge Functions
    ↓
PostgreSQL Database
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file:

```env
EDGE_BASE_URL=https://budgeting.moneko.io
EDGE_API_KEY=your_api_key_here
LOG_LEVEL=info
PORT=8000
```

### 3. Build Widget Assets

The server needs pre-built HTML widgets from the web package:

```bash
cd ../web
npm run build
cd ../server
```

### 4. Build Server

```bash
npm run build
```

### 5. Run Server

```bash
npm start
```

Or for development with hot reload:

```bash
npm run dev
```

## API Endpoints

### SSE Stream
`GET http://localhost:8000/mcp`

Establishes Server-Sent Events connection for MCP protocol.

### Message Posting
`POST http://localhost:8000/mcp/messages?sessionId={sessionId}`

Sends MCP messages to an established session.

## Tools

All tools are namespaced under `moneko.*`:

### Budget Tools
- **moneko.get_budget** - Get current budget status and pacing
- **moneko.set_budget** - Set or update daily budget

### Expense Tools
- **moneko.save_expense** - Record a new expense
- **moneko.list_expenses** - List expenses with filters
- **moneko.expense_summary** - Get category breakdown
- **moneko.update_expense** - Edit existing expense
- **moneko.delete_expense** - Remove expense

### Account Tools
- **moneko.start_auth** - Generate guest claim link
- **moneko.start_upgrade** - Generate upgrade checkout link

## Widget Resources

Three HTML widget resources are registered:

- `ui://widget/budget-status-card.html`
- `ui://widget/category-breakdown.html`
- `ui://widget/expense-table.html`

## Security

### API Key Protection
- `EDGE_API_KEY` is stored only in server environment
- Never exposed to client-side widget code
- All backend calls go through the MCP server proxy

### Identity Headers
- `OpenAI-Conversation-Id` forwarded to Supabase
- `OpenAI-Ephemeral-User-Id` forwarded to Supabase
- Widgets cannot forge identity headers

### CSP Compliance
- Widget HTML files include strict Content Security Policy
- No external script execution
- Limited connect-src to prevent data exfiltration

## Testing

Run unit tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm test -- --coverage
```

Watch mode for development:

```bash
npm run test:watch
```

## Project Structure

```
server/
├── src/
│   ├── index.ts              # HTTP + SSE transport
│   ├── server.ts             # MCP server setup
│   ├── schemas.ts            # Zod input validation
│   ├── lib/
│   │   ├── proxy.ts          # Supabase proxy layer
│   │   ├── transform.ts      # Response transformations
│   │   ├── errors.ts         # Error normalization
│   │   └── logger.ts         # Pino logger setup
│   ├── tools/                # Tool implementations
│   │   ├── getBudget.ts
│   │   ├── setBudget.ts
│   │   ├── saveExpense.ts
│   │   ├── listExpenses.ts
│   │   ├── expenseSummary.ts
│   │   ├── updateExpense.ts
│   │   ├── deleteExpense.ts
│   │   ├── startAuth.ts
│   │   └── startUpgrade.ts
│   ├── widgets/
│   │   └── register.ts       # Widget resource registration
│   └── __tests__/            # Unit tests
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Adding a New Tool

1. Define input schema in `src/schemas.ts`
2. Create tool file in `src/tools/`
3. Implement tool registration and handler
4. Register in `src/server.ts`
5. Write unit tests

### Adding a New Widget

1. Build widget HTML in `../web/`
2. Add widget metadata to `src/widgets/register.ts`
3. Reference widget URI in tool `_meta`

## Troubleshooting

### Widget HTML Not Found

```
Error: Widget HTML for "budget-status-card" not found
```

**Solution**: Build widgets first:
```bash
cd ../web && npm run build
```

### Supabase Connection Errors

```
Error: Failed to connect to backend service
```

**Solution**: Check environment variables:
- `EDGE_BASE_URL` is correct
- `EDGE_API_KEY` is valid
- Supabase Edge functions are deployed

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::8000
```

**Solution**: Change port in `.env`:
```env
PORT=8001
```

## Production Deployment

### Environment Variables

Ensure these are set in production:

```env
EDGE_BASE_URL=https://budgeting.moneko.io
EDGE_API_KEY=<production-key>
LOG_LEVEL=info
PORT=8000
```

### Health Checks

Monitor the following:
- SSE connection establishment rate
- Tool call success/failure rates
- Proxy error rates
- Response times

### Logging

Logs are structured JSON in production. Key fields:
- `level`: info, warn, error
- `sessionId`: SSE session identifier
- `tool`: Tool name being called
- `error`: Error details if applicable

## License

Proprietary - Moneko
