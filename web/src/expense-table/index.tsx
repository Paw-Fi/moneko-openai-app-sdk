import { createRoot } from "react-dom/client";
import { ExpenseTableCompact } from "../components/ExpenseTableCompact";

const root = document.getElementById("expense-table-root");
if (root) {
  createRoot(root).render(<ExpenseTableCompact />);
}

export { ExpenseTableCompact };
export default ExpenseTableCompact;
