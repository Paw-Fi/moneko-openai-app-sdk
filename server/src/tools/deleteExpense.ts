import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DeleteExpenseInput } from "../schemas.js";
import { proxy } from "../lib/proxy.js";
import { toExpenseTablePayload } from "../lib/transform.js";
import { logger } from "../lib/logger.js";
import { parseExpenseRef } from "../lib/refs.js";

/**
 * Register the moneko.delete_expense tool
 * After deleting, re-fetches the expense list with the provided window
 */
export function registerDeleteExpense(
  server: Server,
  widgetUris: { expenseTable: string },
) {
  server.setRequestHandler(
    { method: "tools/call", params: { name: "moneko.delete_expense" } } as any,
    async (request: any) => {
      const args = DeleteExpenseInput.parse(request.params.arguments ?? {});
      // Extract window parameters for refresh (passed from widget)
      const refreshWindow =
        (request.params.arguments as any)?.refreshWindow ?? {};

      logger.info({ args, refreshWindow }, "Calling moneko.delete_expense");

      const expenseId = parseExpenseRef(args.expenseRef);
      if (!expenseId) {
        throw new Error(
          "Invalid expense reference. Refresh the list and try again.",
        );
      }

      // Delete the expense
      await proxy(
        "/delete-expense",
        { expenseIds: expenseId },
        request.meta?.headers ?? {},
        true,
      );

      // Re-fetch the expense list with the same window
      const listPayload = await proxy(
        "/list-expenses",
        {
          startDate: refreshWindow.startDate,
          endDate: refreshWindow.endDate,
          currency: refreshWindow.currency,
        },
        request.meta?.headers ?? {},
        true,
      );

      const { props, expenseRefs } = toExpenseTablePayload(listPayload);

      return {
        content: [{ type: "text", text: "Expense deleted successfully." }],
        structuredContent: props,
        _meta: {
          "openai/outputTemplate": widgetUris.expenseTable,
          "openai/widgetAccessible": true,
          "openai/resultCanProduceWidget": true,
          "moneko/expenseRefs": expenseRefs,
          "openai/toolInvocation/invoking": "Deleting expense…",
          "openai/toolInvocation/invoked": "Expense deleted.",
        },
      };
    },
  );
}

/**
 * Get tool definition for registration
 */
export function deleteExpenseTool(widgetUris: { expenseTable: string }) {
  return {
    name: "moneko.delete_expense",
    title: "Delete Expense",
    description:
      "Use this when the user asks to delete a specific previously listed expense.",
    inputSchema: {
      type: "object",
      properties: {
        expenseRef: {
          type: "string",
          description:
            "Opaque expense reference from the widget (do not ask the user for IDs).",
        },
        refreshWindow: {
          type: "object",
          description:
            "Window parameters for refreshing the list after deletion",
          properties: {
            startDate: { type: "string" },
            endDate: { type: "string" },
            currency: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      required: ["expenseRef"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
    _meta: {
      "openai/outputTemplate": widgetUris.expenseTable,
      "openai/widgetAccessible": true,
      "openai/resultCanProduceWidget": true,
      "openai/toolInvocation/invoking": "Deleting expense…",
      "openai/toolInvocation/invoked": "Expense deleted.",
    },
  };
}
