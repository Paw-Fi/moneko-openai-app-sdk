import { createRoot } from "react-dom/client";
import { BudgetStatusCard } from "../components/BudgetStatusCard";

const root = document.getElementById("budget-status-root");
if (root) {
  createRoot(root).render(<BudgetStatusCard />);
}

export { BudgetStatusCard };
export default BudgetStatusCard;
