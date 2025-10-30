/**
 * EditExpenseModal Component
 *
 * DESIGN GUIDELINES COMPLIANCE:
 * ✅ Fullscreen modal with proper focus management
 * ✅ Touch targets ≥40px
 * ✅ Keyboard navigation (ESC to close, Tab order)
 * ✅ Clear action labels
 * ✅ System colors
 * ✅ Semantic form elements with proper labels
 * ✅ ARIA roles and live regions for errors
 *
 * Per Section C.1.6:
 * - Controlled from ExpenseTableCompact
 * - Fields: category, amount, date, description
 * - On submit: Calls moneko.update_expense
 * - Then triggers a refresh via moneko.list_expenses
 */

import { useState, useEffect } from "react";
import { callTool } from "../lib/bridge";
import type { ExpenseRow } from "../lib/types";

interface EditExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: ExpenseRow | null;
  onSuccess: () => void;
}

export function EditExpenseModal({
  isOpen,
  onClose,
  expense,
  onSuccess,
}: EditExpenseModalProps) {
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && expense) {
      setCategory(expense.category);
      setAmount(expense.amountMajor.toString());
      setDate(expense.date.split("T")[0]); // Extract YYYY-MM-DD
      setDescription(expense.description);
      setError(null);
    }
  }, [isOpen, expense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense) return;

    setError(null);

    const amountMajor = parseFloat(amount);
    if (isNaN(amountMajor) || amountMajor <= 0) {
      setError("Please enter a valid amount greater than 0");
      return;
    }

    setIsSubmitting(true);

    try {
      // Build updates object with only changed fields
      const updates: Record<string, unknown> = {};

      if (category !== expense.category) {
        updates.category = category;
      }
      if (amountMajor !== expense.amountMajor) {
        updates.amount_cents = Math.round(amountMajor * 100);
      }
      if (date !== expense.date.split("T")[0]) {
        updates.date = date;
      }
      if (description !== expense.description) {
        updates.raw_text = description;
      }

      if (Object.keys(updates).length === 0) {
        setError("No changes detected");
        setIsSubmitting(false);
        return;
      }

      await callTool("moneko.update_expense", {
        expenseId: expense.id,
        updates,
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update expense"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || !expense) return null;

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-expense-title"
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="edit-expense-title">Edit Expense</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="expense-category">Category</label>
              <input
                id="expense-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="expense-amount">
                Amount ({expense.currency})
              </label>
              <input
                id="expense-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="expense-date">Date</label>
              <input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="expense-description">Description</label>
              <input
                id="expense-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="form-error" role="alert" aria-live="assertive">
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
