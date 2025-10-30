# Backend Compliance Checklist (Section A)

- [x] /set-budget: Early-return bug fixed; creates contact when missing; JSON mode via Accept header; JSON includes date, currency, daysInMonth, dayApplied, dailyBudgetCents, totals.spentToDateCents, totals.remainingToDateCents, totals.projectedMonthRemainingCents
- [x] /get-budget: JSON mode via Accept header; JSON includes required pacing fields
- [x] /list-expenses: Currency filter applied; single client bootstrap; structured JSON unchanged
- [x] /expenses-summary: JSON override via Accept; personal-only for GPT (exclude household_id); structured JSON unchanged
- [x] /analyze-expense: Include resolvedUserId + meta in success response
- [x] gpt-guests: Deterministic (contact-first + deterministic email), no list-wide scans
- [x] Acceptance tests: All endpoints pass schema + behavior checks

# MCP Server Checklist (Section B)

- [x] Tech stack: Node 18+, @modelcontextprotocol/sdk, undici, zod, pino, dotenv
- [x] Environment variables: EDGE_BASE_URL, EDGE_API_KEY, LOG_LEVEL, PORT
- [x] File layout: index.ts, server.ts, tools/, lib/, schemas.ts, widgets/
- [x] Proxy layer (proxy.ts): Headers, Accept: application/json, error normalization
- [x] Input schemas (schemas.ts): All tools with zod validation
- [x] Transforms (transform.ts): toBudgetStatusCard, toExpenseTablePayload, toCategoryBreakdownPayload
- [x] Tool registration: All 9 tools registered with _meta["openai/outputTemplate"]
- [x] MCP server transport: SSE endpoint, POST backchannel, session management
- [x] Widget registration: Read HTML files, register as MCP resources
- [x] Testing: Unit tests for validation, transforms, proxy error mapping

# Widget Resources Checklist (Section C)

- [x] BudgetStatusCard.tsx: Progress ring, adjust budget, guest claim, overspend upsell, PrivacyPopover
- [x] AdjustBudgetModal.tsx: Amount input, currency/date prefilled, calls moneko.set_budget
- [x] CategoryBreakdownChart.tsx: Breakdown visualization, see all transactions, upsell banner, PrivacyPopover
- [x] ExpenseTableCompact.tsx: Transaction table, edit/delete with refresh, PrivacyPopover
- [x] EditExpenseModal.tsx: Category, amount, date, description fields, calls moneko.update_expense
- [x] PrivacyPopover.tsx: Required transparency disclosure with privacy policy link
- [x] bridge.ts: callTool(), openExternal(), sendFollowUpMessage() wrappers
- [x] hooks.ts: useOpenAiGlobal(), useWidgetProps(), useTheme() React hooks
- [x] types.ts: OpenAiGlobals, widget prop types, TypeScript definitions
- [x] HTML templates: budget-status-card.html, category-breakdown.html, expense-table.html with CSP
- [x] Build configuration: Vite config, multi-entry bundling, HTML inlining script
- [x] CSS styles: Global + widget-specific, mobile-responsive, dark mode support
- [x] Test harness: Development testing tool with sample data and mock bridge
- [x] README: Comprehensive documentation with architecture, specs, security notes
- [x] Mobile responsiveness: Tested at ≥375px width, touch targets ≥40px
- [x] Accessibility: WCAG 2.1 AA compliance, keyboard navigation, ARIA labels

# Tool Set and Intent Prompts (Section D)

- [x] moneko.save_expense: Description and response with BudgetStatusCard
- [x] moneko.get_budget: Description and response with BudgetStatusCard
- [x] moneko.set_budget: Description and response with BudgetStatusCard
- [x] moneko.expense_summary: Description and response with CategoryBreakdownChart
- [x] moneko.list_expenses: Description and response with ExpenseTableCompact
- [x] moneko.update_expense: Description with refresh logic
- [x] moneko.delete_expense: Description with refresh logic
- [x] moneko.start_auth: Description for guest account claim
- [x] moneko.start_upgrade: Description for upgrade flow
- [x] Safety text: Conditional phrasing, no investment advice, explicit date/currency

# Testing Gates Checklist (Section E)

- [ ] E.1: Backend contract tests with OpenAI-Conversation-Id and Accept: application/json
- [x] E.2: MCP server unit tests (zod validation, proxy errors, transforms)
- [ ] E.3: MCP Inspector manual tests (list tools, call moneko.get_budget, verify structuredContent)
- [x] E.4: Widget runtime tests with test harness (render, interactions, tool calls)
- [x] E.5: Mobile viewport sanity (375px width, touch targets ≥40px)

# Security and Privacy Requirements (Section F)

- [x] F.1: EDGE_API_KEY only in MCP server, never in widgets
- [x] F.2: Identity headers forwarded by MCP server, widgets cannot escalate privilege
- [x] F.3: CSP meta tags in all HTML files
- [x] F.4: Conditional phrasing in all budget projections ("at this pace", "on track to")
- [x] F.5: PrivacyPopover in all widgets with required disclosure text

# Definition of Done (Section G)

- [x] Backend fixes: All Section A items completed
- [x] MCP server: All Section B items completed
- [x] Widget runtime: All Section C items completed
- [x] Tool descriptions: All Section D items completed
- [ ] Testing: All Section E items completed (E.1 and E.3 require manual testing)
- [x] Security: All Section F items completed
- [ ] Golden prompt tests: All scenarios working in ChatGPT dev mode (requires deployment)

---

# OpenAI Reference Audit Compliance (Post-Implementation Review)

## CRITICAL FIXES (REQUIRED)

### ✅ PARTIALLY COMPLETE: structuredContent Shape Correction
- [x] getBudget.ts - Returns `structuredContent: props` (not wrapped)
- [x] setBudget.ts - Returns `structuredContent: props` (not wrapped)
- [ ] saveExpense.ts - Needs fix
- [ ] listExpenses.ts - Needs fix
- [ ] expenseSummary.ts - Needs fix
- [ ] updateExpense.ts - Needs fix
- [ ] deleteExpense.ts - Needs fix

**Impact**: Without this fix, widgets receive `{component, props}` instead of props directly, breaking prop binding.

### 🔄 PENDING: Session Cleanup on Connect Failure
- [ ] Fix server/src/index.ts handleSseRequest catch block to delete session
- **Code**: Add `if (sessionId) sessions.delete(sessionId);` before throw

**Impact**: Prevents memory leak when server.connect() fails.

## ENHANCEMENTS (Nice to Have)

### ✅ PARTIALLY COMPLETE: Tool Metadata Enhancement
- [x] getBudget: Added title, annotations, additionalProperties:false, openai/resultCanProduceWidget
- [x] setBudget: Added title, annotations, additionalProperties:false, openai/resultCanProduceWidget
- [ ] Remaining 7 tools need same enhancements

**Impact**: Suppresses approval prompts, provides better UX, stricter validation.

### 🔄 PENDING: Resource Metadata
- [ ] Add _meta to ListResources response
- [ ] Add _meta to ReadResource contents
- [ ] Add ListResourceTemplates handler

**File**: server/src/server.ts

### 🔄 PENDING: Widget adjustments (Optional)
- [ ] Update AdjustBudgetModal to expect props directly from response
- [ ] Update BudgetStatusCard local state handling

**File**: web/src/components/AdjustBudgetModal.tsx, BudgetStatusCard.tsx

## Implementation Guide

See `server/AUDIT_FIXES.md` for detailed fixes and patterns to apply to remaining tools.
