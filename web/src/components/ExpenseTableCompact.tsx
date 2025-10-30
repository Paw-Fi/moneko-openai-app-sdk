/**
 * ExpenseTableCompact Component
 *
 * DESIGN GUIDELINES COMPLIANCE:
 * ✅ Inline/Fullscreen hybrid (responsive to content)
 * ✅ Semantic table with proper ARIA labels
 * ✅ Touch targets ≥40px (buttons)
 * ✅ Keyboard navigation support
 * ✅ Mobile-responsive (table → cards on mobile)
 * ✅ Clear action labels with confirmation
 * ✅ Monochromatic outlined icons
 * ✅ System colors throughout
 *
 * Per Section C.1.3:
 * - Renders table of expenses
 * - Edit button → opens EditExpenseModal → moneko.update_expense → refresh
 * - Delete button → moneko.delete_expense → refresh
 * - Always includes PrivacyPopover
 */

import { useState } from "react";
import { useWidgetProps } from "../lib/hooks";
import { callTool } from "../lib/bridge";
import { PrivacyPopover } from "./PrivacyPopover";
import { EditExpenseModal } from "./EditExpenseModal";
import type { ExpenseTableCompactProps, ExpenseRow } from "../lib/types";

export function ExpenseTableCompact() {
  const props = useWidgetProps<ExpenseTableCompactProps>();
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!props || !props.rows) {
    return (
      <div className="expense-table loading">
        <p>Loading expenses...</p>
      </div>
    );
  }

  const { rows, window: timeWindow } = props;

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handleEdit = (expense: ExpenseRow) => {
    setEditingExpense(expense);
  };

  const handleDelete = async (expense: ExpenseRow) => {
    if (
      !confirm(
        `Are you sure you want to delete this expense?\n\n${expense.description} - ${formatAmount(expense.amountMajor, expense.currency)}`
      )
    ) {
      return;
    }

    setDeletingId(expense.id);

    try {
      await callTool("moneko.delete_expense", {
        expenseId: expense.id,
      });

      // Refresh the list after deletion
      await refreshList();
    } catch (err) {
      console.error("Failed to delete expense:", err);
      alert("Failed to delete expense. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const refreshList = async () => {
    try {
      // Re-fetch the list with the same window parameters
      await callTool("moneko.list_expenses", {
        startDate: timeWindow.startDate,
        endDate: timeWindow.endDate,
        currency: timeWindow.currency,
      });
    } catch (err) {
      console.error("Failed to refresh list:", err);
    }
  };

  const handleEditSuccess = async () => {
    await refreshList();
  };

  if (rows.length === 0) {
    return (
      <div className="expense-table empty" role="article" aria-label="No expenses found">
        <div className="empty-state">
          <svg
            className="empty-icon"
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            role="img"
            aria-label="No transactions"
          >
            <title>No transactions</title>
            <circle
              cx="32"
              cy="32"
              r="30"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.2"
            />
            <path
              d="M32 24v16M24 32h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <h2>No Expenses Found</h2>
          <p>
            {timeWindow.startDate && timeWindow.endDate
              ? `No transactions from ${formatDate(timeWindow.startDate)} to ${formatDate(timeWindow.endDate)}`
              : "No transactions in this period"}
          </p>
        </div>
        <footer className="expense-footer">
          <PrivacyPopover />
        </footer>
      </div>
    );
  }

  return (
    <div className="expense-table" role="article">
      <header className="table-header">
        <h1 className="table-title" id="table-title">Transactions</h1>
        {timeWindow.startDate && timeWindow.endDate && (
          <p className="table-period">
            {formatDate(timeWindow.startDate)} to {formatDate(timeWindow.endDate)}
          </p>
        )}
      </header>

      <div className="table-container">
        <table role="table" aria-labelledby="table-title">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Description</th>
              <th scope="col">Category</th>
              <th scope="col" className="amount-col">Amount</th>
              <th scope="col" className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((expense) => (
              <tr key={expense.id}>
                <td className="date-col">{formatDate(expense.date)}</td>
                <td className="description-col">
                  {expense.description || "—"}
                </td>
                <td className="category-col">{expense.category}</td>
                <td className="amount-col">
                  {formatAmount(expense.amountMajor, expense.currency)}
                </td>
                <td className="actions-col">
                  <div className="action-buttons" role="group" aria-label={`Actions for ${expense.description || "expense"}`}>
                    <button
                      type="button"
                      className="btn-icon btn-edit"
                      onClick={() => handleEdit(expense)}
                      aria-label={`Edit ${expense.description || "expense"}, ${formatAmount(expense.amountMajor, expense.currency)}`}
                      disabled={deletingId === expense.id}
                      title="Edit expense"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M14.167 2.5A2.357 2.357 0 0 1 17.5 5.833l-11.25 11.25L1.667 18.333l1.25-4.583 11.25-11.25Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn-icon btn-delete"
                      onClick={() => handleDelete(expense)}
                      aria-label={`Delete ${expense.description || "expense"}, ${formatAmount(expense.amountMajor, expense.currency)}`}
                      disabled={deletingId === expense.id}
                      title="Delete expense"
                    >
                      {deletingId === expense.id ? (
                        <span className="spinner" aria-label="Deleting..." role="status">⋯</span>
                      ) : (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M2.5 5h15M6.667 5V3.333a1.667 1.667 0 0 1 1.666-1.666h3.334a1.667 1.667 0 0 1 1.666 1.666V5m2.5 0v11.667a1.667 1.667 0 0 1-1.666 1.666H5.833a1.667 1.667 0 0 1-1.666-1.666V5h11.666Z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="expense-footer">
        <PrivacyPopover />
      </footer>

      <EditExpenseModal
        isOpen={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        expense={editingExpense}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
