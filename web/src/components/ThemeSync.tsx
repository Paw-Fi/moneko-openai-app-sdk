import { useEffect } from "react";
import { useTheme } from "../lib/hooks";

export function ThemeSync() {
  const theme = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return null;
}

