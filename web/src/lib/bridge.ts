/**
 * Bridge for OpenAI Apps SDK communication
 *
 * This file wraps host → MCP calls. Widgets must not talk directly to Supabase
 * or hold secrets. They should ONLY go through the Apps SDK bridge.
 *
 * Per Section C.2 of IMPLEMENTATION_ADDENDUM.md
 */

/**
 * Call an MCP tool through the OpenAI Apps SDK bridge
 *
 * @param toolName - Name of the MCP tool (e.g., "moneko.set_budget")
 * @param args - Tool arguments
 * @returns Promise resolving to tool response
 * @throws Error if bridge is not available
 */
export async function callTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ result: string }> {
  if (!window.openai || !window.openai.callTool) {
    throw new Error("Bridge missing: callTool is not available");
  }

  return await window.openai.callTool(toolName, args);
}

/**
 * Open an external URL through the OpenAI Apps SDK bridge
 *
 * Falls back to window.open if bridge is not available
 *
 * @param href - URL to open
 */
export function openExternal(href: string): void {
  if (window.openai && window.openai.openExternal) {
    window.openai.openExternal({ href });
    return;
  }

  // Fallback for testing outside ChatGPT
  window.open(href, "_blank", "noopener,noreferrer");
}

/**
 * Send a follow-up message to the chat
 *
 * @param prompt - Message to send
 */
export async function sendFollowUpMessage(prompt: string): Promise<void> {
  if (!window.openai || !window.openai.sendFollowUpMessage) {
    console.warn("Bridge missing: sendFollowUpMessage is not available");
    return;
  }

  await window.openai.sendFollowUpMessage({ prompt });
}

/**
 * Request a display mode change
 *
 * @param mode - Requested display mode
 * @returns Promise resolving to granted mode (may differ from request)
 */
export async function requestDisplayMode(
  mode: "pip" | "inline" | "fullscreen"
): Promise<{ mode: "pip" | "inline" | "fullscreen" }> {
  if (!window.openai || !window.openai.requestDisplayMode) {
    console.warn("Bridge missing: requestDisplayMode is not available");
    return { mode: "inline" };
  }

  return await window.openai.requestDisplayMode({ mode });
}
