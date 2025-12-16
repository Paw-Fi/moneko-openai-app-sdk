import { createRoot } from "react-dom/client";
import { MembershipWidget } from "./widget";

const root = document.getElementById("membership-root");
if (root) {
  createRoot(root).render(<MembershipWidget />);
}

export { MembershipWidget };
export default MembershipWidget;

