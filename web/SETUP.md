# Setup Guide - Moneko Widgets (@moneko-openai-app-sdk/web)

Quick start guide for developing and building the Moneko OpenAI App widgets.

## Prerequisites

- **Node.js**: 18.0.0 or higher
- **Package Manager**: pnpm (recommended), npm, or yarn
- **Browser**: Modern browser with ES2022 support

## Installation

```bash
# Navigate to the web directory
cd /Users/charles/side-projects/Moneko/moneko-openai-app-sdk/web

# Install dependencies
pnpm install

# Or with npm
npm install
```

## Development Workflow

### 1. Start Development Server

```bash
pnpm dev
```

This starts Vite dev server at `http://localhost:4445` with:
- Hot module replacement (HMR)
- Individual widget endpoints
- Index page listing all widgets

**Available endpoints:**
- `http://localhost:4445/` - Index page
- `http://localhost:4445/budget-status.html` - Budget Status Card
- `http://localhost:4445/category-breakdown.html` - Category Breakdown Chart
- `http://localhost:4445/expense-table.html` - Expense Table

### 2. Test with Test Harness

Open `test-harness.html` in your browser (drag and drop into browser window):

```bash
open test-harness.html
```

**Features:**
- Select widget to test
- Edit props JSON (sample data pre-loaded)
- Apply props to see live updates
- Toggle dark mode
- Monitor tool calls in log

**Sample workflow:**
1. Select "Budget Status Card"
2. Click "Load Sample Data"
3. Click "Apply Props"
4. Test "Adjust Budget" button
5. Test "Save this in Moneko" button
6. Toggle dark mode to see theme changes

### 3. Type Checking

```bash
pnpm typecheck
```

Runs TypeScript compiler in `--noEmit` mode to catch type errors without building.

## Production Build

### Full Build

```bash
pnpm build
```

This runs:
1. TypeScript compilation (`tsc`)
2. Vite bundling (`vite build`)
3. HTML inlining (`tsx scripts/build-html.ts`)

**Output** in `dist/`:
- `budget-status-card.html` (self-contained)
- `category-breakdown.html` (self-contained)
- `expense-table.html` (self-contained)
- Source `.js` and `.css` files (for debugging)

### Individual Build Steps

```bash
# Compile TypeScript only
pnpm typecheck

# Build with Vite only
pnpm build:vite

# Inline HTML only (requires Vite build first)
pnpm build:html
```

## File Structure

```
web/
├── src/
│   ├── components/          # React components
│   │   ├── BudgetStatusCard.tsx
│   │   ├── AdjustBudgetModal.tsx
│   │   ├── CategoryBreakdownChart.tsx
│   │   ├── ExpenseTableCompact.tsx
│   │   ├── EditExpenseModal.tsx
│   │   └── PrivacyPopover.tsx
│   ├── lib/                 # Utilities and hooks
│   │   ├── bridge.ts        # OpenAI Apps SDK bridge
│   │   ├── hooks.ts         # React hooks
│   │   └── types.ts         # TypeScript definitions
│   ├── budget-status/       # Widget entry points
│   │   ├── index.tsx
│   │   └── styles.css
│   ├── category-breakdown/
│   │   ├── index.tsx
│   │   └── styles.css
│   ├── expense-table/
│   │   ├── index.tsx
│   │   └── styles.css
│   └── styles.css           # Global styles
├── public/                  # HTML templates with CSP
│   ├── budget-status-card.html
│   ├── category-breakdown.html
│   └── expense-table.html
├── scripts/                 # Build scripts
│   └── build-html.ts
├── dist/                    # Build output (gitignored)
├── test-harness.html        # Testing tool
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Common Tasks

### Adding a New Widget

1. Create component in `src/components/MyWidget.tsx`
2. Create entry directory `src/my-widget/`
3. Create `src/my-widget/index.tsx`:
   ```typescript
   import { createRoot } from "react-dom/client";
   import { MyWidget } from "../components/MyWidget";

   const root = document.getElementById("my-widget-root");
   if (root) {
     createRoot(root).render(<MyWidget />);
   }
   ```
4. Create `src/my-widget/styles.css`
5. Create `public/my-widget.html` with CSP header
6. Update `scripts/build-html.ts` to include new widget

### Updating Widget Props

Props are defined in `src/lib/types.ts`. After changing types:

```bash
pnpm typecheck
```

Props flow: MCP Server → `toolOutput` → `useWidgetProps()` → Component

### Styling Guidelines

- Use CSS custom properties (design tokens) from `src/styles.css`
- Follow mobile-first responsive design (≥375px)
- Ensure touch targets ≥40px tall
- Test both light and dark modes
- Maintain WCAG 2.1 AA contrast ratios

### Testing Checklist

Before committing:

- [ ] `pnpm typecheck` passes
- [ ] All widgets render in dev server
- [ ] Test harness works with sample data
- [ ] Mobile responsive at 375px width
- [ ] Dark mode works
- [ ] All buttons/modals function correctly
- [ ] PrivacyPopover appears in all widgets
- [ ] Production build succeeds (`pnpm build`)

## Troubleshooting

### Port 4445 Already in Use

```bash
# Kill process on port 4445
lsof -ti:4445 | xargs kill -9

# Or change port in vite.config.ts
```

### Build Fails

```bash
# Clean and rebuild
rm -rf dist node_modules
pnpm install
pnpm build
```

### TypeScript Errors

```bash
# Check for type errors
pnpm typecheck

# Common fixes:
# - Update @types packages
# - Check import paths (must be .js for Vite)
```

### Widget Not Loading in Test Harness

1. Ensure dev server is running (`pnpm dev`)
2. Check browser console for CORS errors
3. Verify iframe src points to `http://localhost:4445`
4. Check that widget props JSON is valid

## Integration with MCP Server

The MCP server (Section B) will:

1. Read built HTML files from `dist/`
2. Register them as MCP resources:
   - `ui://widget/budget-status-card.html`
   - `ui://widget/category-breakdown.html`
   - `ui://widget/expense-table.html`
3. Return `structuredContent` with widget props
4. OpenAI renders the widget iframe with props

**Widget → MCP → Supabase flow:**

```
Widget calls bridge.callTool('moneko.set_budget', {...})
  ↓
window.openai.callTool('moneko.set_budget', {...})
  ↓
MCP Server proxy() → Supabase Edge /set-budget
  ↓
Response → Transform → structuredContent
  ↓
Widget receives updated props via toolOutput
```

## Next Steps

After completing Section C (Widgets):

1. **Section B** (MCP Server): Implement server that serves these widgets
2. **Section E** (Testing): Run full E2E tests with MCP Inspector
3. **Section G** (Ship): Deploy to production

## Resources

- [OpenAI Apps SDK Examples](https://github.com/openai/openai-apps-sdk-examples)
- [IMPLEMENTATION_ADDENDUM.md](../IMPLEMENTATION_ADDENDUM.md) - Full specification
- [README.md](./README.md) - Architecture and API documentation
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)

## Support

For issues or questions:

1. Check [README.md](./README.md) for architecture details
2. Review [IMPLEMENTATION_ADDENDUM.md](../IMPLEMENTATION_ADDENDUM.md) Section C
3. Test with `test-harness.html` for debugging
4. Check browser console for errors

---

**Status**: Section C (Widget Resources) - ✅ COMPLETE

All widgets implemented, tested, and documented per IMPLEMENTATION_ADDENDUM.md Section C.
