/**
 * React hooks for OpenAI Apps SDK integration
 * Based on official OpenAI examples
 */

import { useSyncExternalStore } from "react";
import {
  SET_GLOBALS_EVENT_TYPE,
  SetGlobalsEvent,
  type OpenAiGlobals,
} from "./types";

/**
 * Subscribe to a specific OpenAI global property
 *
 * @param key - Property key to subscribe to
 * @returns Current value of the property, or null if not available
 */
export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(
  key: K
): OpenAiGlobals[K] | null {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") {
        return () => {};
      }

      const handleSetGlobal = (event: SetGlobalsEvent) => {
        const value = event.detail.globals[key];
        if (value === undefined) {
          return;
        }

        onChange();
      };

      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, {
        passive: true,
      });

      return () => {
        window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
      };
    },
    () => window.openai?.[key] ?? null,
    () => window.openai?.[key] ?? null
  );
}

/**
 * Get widget props from toolOutput
 *
 * AUDIT FIX: The host hydrates window.openai.toolOutput with structuredContent directly.
 * MCP server returns structuredContent as the props object (not wrapped).
 * Widget selection is handled by _meta['openai/outputTemplate'].
 *
 * @param defaultState - Default props to use if toolOutput is not available
 * @returns Widget props
 */
export function useWidgetProps<T extends object>(
  defaultState?: T | (() => T)
): T | null {
  const props = useOpenAiGlobal("toolOutput") as T | null;

  const fallback =
    typeof defaultState === "function"
      ? (defaultState as () => T | null)()
      : defaultState ?? null;

  return props ?? fallback;
}

/**
 * Get current theme (light or dark)
 *
 * @returns Current theme
 */
export function useTheme(): "light" | "dark" {
  return useOpenAiGlobal("theme") ?? "light";
}

/**
 * Get user agent information
 *
 * @returns User agent info including device type and capabilities
 */
export function useUserAgent() {
  return useOpenAiGlobal("userAgent");
}

/**
 * Get maximum available height for the widget
 *
 * @returns Max height in pixels
 */
export function useMaxHeight(): number | null {
  return useOpenAiGlobal("maxHeight");
}

/**
 * Get current display mode
 *
 * @returns Display mode (pip, inline, or fullscreen)
 */
export function useDisplayMode() {
  return useOpenAiGlobal("displayMode");
}
