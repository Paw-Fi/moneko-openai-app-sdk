import { createRoot } from "react-dom/client";
import { AppShell } from "./shell";

const root = document.getElementById("app-shell-root");
if (root) {
  createRoot(root).render(<AppShell />);
}

export { AppShell };
export default AppShell;

