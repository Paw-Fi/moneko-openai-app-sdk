# Moneko OpenAI App - Widget Runtime (@moneko-openai-app-sdk/web)

Secure, review-ready UI widgets for the Moneko budgeting app, designed to render inside ChatGPT's OpenAI Apps runtime.

## Overview

This package implements Section C (Widget Resources / CSP) of the [IMPLEMENTATION_ADDENDUM.md](../IMPLEMENTATION_ADDENDUM.md). It provides three production-ready widgets:

1. **BudgetStatusCard** - Daily budget pacing and status
2. **CategoryBreakdownChart** - Spending breakdown by category
3. **ExpenseTableCompact** - Transaction list with edit/delete

All widgets:
- ✅ Render deterministically from `structuredContent.props`
- ✅ Include required CSP meta tags
- ✅ Display PrivacyPopover for transparency
- ✅ Use conditional phrasing ("at this pace", "on track to")
- ✅ Support mobile responsiveness (≥375px width)
- ✅ Meet accessibility requirements (WCAG 2.1 AA)
- ✅ Have touch targets ≥40px tall
- ✅ Never hold secrets or talk directly to Supabase

## Architecture

```
web/
├── src/
│   ├── components/          # React widget components
│   │   ├── BudgetStatusCard.tsx
│   │   ├── AdjustBudgetModal.tsx
│   │   ├── CategoryBreakdownChart.tsx
│   │   ├── ExpenseTableCompact.tsx
│   │   ├── EditExpenseModal.tsx
│   │   └── PrivacyPopover.tsx
│   ├── lib/
│   │   ├── bridge.ts        # OpenAI Apps SDK bridge
│   │   ├── hooks.ts         # React hooks for SDK
│   │   └── types.ts         # TypeScript definitions
│   ├── budget-status/       # Widget entry points
│   ├── category-breakdown/
│   ├── expense-table/
│   └── styles.css           # Global styles
├── public/                  # HTML templates with CSP
│   ├── budget-status-card.html
│   ├── category-breakdown.html
│   └── expense-table.html
├── dist/                    # Build output
└── test-harness.html        # Development testing tool
```

## Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Open browser to http://localhost:4445
```

The dev server provides:
- Hot module replacement
- Individual widget endpoints (e.g., `/budget-status.html`)
- Index page with all widgets

### Testing with Test Harness

The test harness simulates the OpenAI Apps SDK environment:

1. Open `test-harness.html` in your browser
2. Select a widget to test
3. Edit props JSON
4. Apply props to see live updates
5. Test dark mode toggle
6. Monitor tool calls in the log

**Sample props are pre-loaded for each widget.**

### Building for Production

```bash
# Full build (TypeScript → Vite → HTML inlining)
pnpm build

# Build steps individually
pnpm build:vite      # Compile with Vite
pnpm build:html      # Inline JS/CSS into HTML
```

Build output in `dist/`:
- `budget-status-card.html` (self-contained)
- `category-breakdown.html` (self-contained)
- `expense-table.html` (self-contained)

Each HTML file has:
- Inlined JavaScript (ES modules)
- Inlined CSS
- CSP meta tag per Section C.3

## Widget Specifications

### BudgetStatusCard

**Props** (from `toBudgetStatusCard` transform):
```typescript
{
  date: string;                         // YYYY-MM-DD
  currency: string;                     // ISO 4217
  dailyBudgetMajor: number;            // Major units (e.g., 30.00)
  spentToDateMajor: number;
  remainingTodayMajor: number;
  projectedMonthRemainingMajor: number;
  daysInMonth: number;
  dayApplied: number;                  // Current day
  risk: {
    projectedNegative: boolean;        // Show overspend warning?
  };
  guestInfo: {
    isGuest: boolean;
    canClaim: boolean;                 // Show "Save in Moneko" button?
  };
}
```

**Features**:
- Progress ring visualization
- "Adjust daily budget" → `AdjustBudgetModal` → `moneko.set_budget`
- Guest account claim → `moneko.start_auth` → `openExternal`
- Overspend upsell → `moneko.start_upgrade` → `openExternal`

### CategoryBreakdownChart

**Props** (from `toCategoryBreakdownPayload` transform):
```typescript
{
  timeWindow: {
    startDate?: string;
    endDate?: string;
  };
  breakdown: Array<{
    currency: string;
    totalAmountMajor: number;
    totals: Array<{
      category: string;
      amountMajor: number;
      share: number;              // 0.0 - 1.0
    }>;
  }>;
}
```

**Features**:
- Bar chart + donut chart (local SVG, no remote APIs)
- "See all transactions" → `moneko.list_expenses`
- Upsell if any category share > 0.3

### ExpenseTableCompact

**Props** (from `toExpenseTablePayload` transform):
```typescript
{
  rows: Array<{
    id: string;
    date: string;
    description: string;
    category: string;
    amountMajor: number;
    currency: string;
  }>;
  window: {
    startDate: string | null;
    endDate: string | null;
    currency: string | null;
  };
}
```

**Features**:
- Responsive table (mobile: card layout)
- Edit → `EditExpenseModal` → `moneko.update_expense` → refresh
- Delete → `moneko.delete_expense` → refresh
- Preserves `window` params for refresh calls

## Security & Compliance

### Content Security Policy

All HTML files include this CSP meta tag (per Section C.3):

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               connect-src 'self';
               img-src 'self' data:;
               style-src 'self' 'unsafe-inline';
               script-src 'self';
               frame-ancestors 'none';">
```

**Rationale**:
- `default-src 'self'`: Block all external resources
- `connect-src 'self'`: No external API calls (all via MCP bridge)
- `script-src 'self'`: Only inlined scripts allowed
- `frame-ancestors 'none'`: Prevent clickjacking

### Bridge Architecture

Widgets **MUST NOT**:
- Talk directly to Supabase
- Hold `EDGE_API_KEY` or other secrets
- Send arbitrary user IDs

Widgets **MUST**:
- Use `callTool()` from `bridge.ts` for all MCP operations
- Use `openExternal()` for external URLs
- Never infer or fetch data independently

### Privacy Requirements (Section F.5)

Every widget includes `<PrivacyPopover>` with this text:

> "Moneko keeps your expenses and budgets so you can review and edit them later. You can change or delete any entry. Read our Privacy Policy at moneko.io/privacy-policy."

This signals:
- Data persistence
- User control (edit/delete)
- Privacy policy location

Required for OpenAI review.

### Conditional Phrasing (Section F.4)

All budget projections use conditional language:
- ✅ "At this pace, ~€120 left by end of month"
- ✅ "You're on track to overspend by ~€85"
- ❌ "You will save €120" (too definitive)
- ❌ "Guaranteed €85 over budget" (misleading)

## Accessibility

### WCAG 2.1 AA Compliance

- ✅ Touch targets ≥40px (buttons, inputs, icons)
- ✅ Color contrast ratios meet AA standards
- ✅ Keyboard navigation (modals, forms, tables)
- ✅ ARIA labels for icons and interactive elements
- ✅ Focus indicators on all interactive elements
- ✅ Semantic HTML (headings, landmarks, tables)

### Responsive Design

- **Desktop** (≥768px): Full table layout, side-by-side components
- **Tablet** (640px-768px): Stacked layout, responsive tables
- **Mobile** (375px-640px): Card-based table, stacked actions
- **Small Mobile** (≤375px): Optimized spacing, reduced font sizes

All widgets tested at 375px width per Section E.5.

## TypeScript

Full type safety with:
- `OpenAiGlobals` - SDK global types
- `BudgetStatusCardProps` - Widget prop types
- `ExpenseRow`, `CategoryBreakdown` - Data types
- `CallTool`, `CallToolResponse` - Bridge types

Run type checking:
```bash
pnpm typecheck
```

## Integration with MCP Server

The MCP server (Section B) returns `structuredContent`:

```typescript
{
  structuredContent: {
    component: 'BudgetStatusCard',
    props: toBudgetStatusCard(payload)  // Transform applied
  },
  content: [
    { type: 'text', text: 'Here's your current budget status.' }
  ]
}
```

The widget reads `props` from `window.openai.toolOutput` via `useWidgetProps()` hook.

**No props inference.** Widgets are deterministic functions of their props.

## Testing Checklist (Section E.4)

- [x] BudgetStatusCard renders with sample props
- [x] "Adjust Budget" opens modal → calls `moneko.set_budget`
- [x] "Save this in Moneko" calls `moneko.start_auth` → `openExternal`
- [x] Overspend warning → "Enable alerts" → `moneko.start_upgrade`
- [x] CategoryBreakdownChart renders breakdown
- [x] "See all transactions" → `moneko.list_expenses`
- [x] Upsell appears when category share > 0.3
- [x] ExpenseTableCompact renders rows
- [x] Edit expense → modal → `moneko.update_expense` → refresh
- [x] Delete expense → confirm → `moneko.delete_expense` → refresh
- [x] PrivacyPopover present in all widgets
- [x] CSP meta tag in all HTML files
- [x] Mobile viewport (375px) renders correctly
- [x] Dark mode support via theme prop

## Mobile Responsiveness (Section E.5)

Tested at:
- ✅ 375px width (iPhone SE)
- ✅ 390px width (iPhone 12)
- ✅ 428px width (iPhone 14 Pro Max)

**No horizontal overflow.** All touch targets ≥40px tall.

## Related Sections

- **Section B** (MCP Server): `@moneko-openai-app-sdk/server`
- **Section A** (Backend Fixes): Supabase Edge functions
- **Section G** (Ship Criteria): Definition of Done

## License

Proprietary - Moneko
