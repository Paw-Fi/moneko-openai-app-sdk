import "../styles.css";
import { createRoot } from "react-dom/client";
import { AppShell } from "../app-shell/shell";
import { ThemeSync } from "../components/ThemeSync";
import { MembershipWidget } from "../membership/widget";
import { BudgetStatusCard } from "../components/BudgetStatusCard";
import { CategoryBreakdownChart } from "../components/CategoryBreakdownChart";
import { ExpenseTableCompact } from "../components/ExpenseTableCompact";

function mount(rootId: string, element: JSX.Element): boolean {
  const root = document.getElementById(rootId);
  if (!root) return false;
  createRoot(root).render(element);
  return true;
}

// Production runtime: a single bundle that can mount any widget, depending on which root exists in the HTML template.
// This avoids code-splitting (extra chunk fetches) inside ChatGPT's widget sandbox.
if (!(window as any).__moneko_widget_runtime_mounted) {
  (window as any).__moneko_widget_runtime_mounted = true;

  mount(
    "app-shell-root",
    <>
      <ThemeSync />
      <AppShell />
    </>
  ) ||
    mount(
      "membership-root",
      <>
        <ThemeSync />
        <MembershipWidget />
      </>
    ) ||
    mount(
      "budget-status-root",
      <>
        <ThemeSync />
        <BudgetStatusCard />
      </>
    ) ||
    mount(
      "category-breakdown-root",
      <>
        <ThemeSync />
        <CategoryBreakdownChart />
      </>
    ) ||
    mount(
      "expense-table-root",
      <>
        <ThemeSync />
        <ExpenseTableCompact />
      </>
    );
}
