import { createRoot } from "react-dom/client";
import { CategoryBreakdownChart } from "../components/CategoryBreakdownChart";

const root = document.getElementById("category-breakdown-root");
if (root) {
  createRoot(root).render(<CategoryBreakdownChart />);
}

export { CategoryBreakdownChart };
export default CategoryBreakdownChart;
