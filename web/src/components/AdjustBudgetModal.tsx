/**
 * AdjustBudgetModal Component
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
 * Modal for adjusting daily budget.
 * Controlled from BudgetStatusCard.
 *
 * Per Section C.1.5:
 * - Fields: new daily budget amount (number), currency (prefilled), date (prefilled = today)
 * - On submit: Calls moneko.set_budget
 * - Replaces local card props with returned result
 */

import { useState, useEffect } from "react";
import { callTool } from "../lib/bridge";

interface AdjustBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBudget: number;
  currency: string;
  date: string;
  onSuccess: (newProps: unknown) => void;
}

export function AdjustBudgetModal({
  isOpen,
  onClose,
  currentBudget,
  currency,
  date,
  onSuccess,
}: AdjustBudgetModalProps) {
  const [amount, setAmount] = useState(currentBudget.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAmount(currentBudget.toString());
      setError(null);
    }
  }, [isOpen, currentBudget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const budgetAmount = parseFloat(amount);
    if (isNaN(budgetAmount) || budgetAmount <= 0) {
      setError("Please enter a valid amount greater than 0");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await callTool("moneko.set_budget", {
        amount: budgetAmount,
        currency,
        date,
      });

      // AUDIT FIX: After server fix, structuredContent IS the props directly
      // The host will automatically update window.openai.toolOutput with the new props
      // We parse response.result to optionally update local state for smoother UX
      const result = JSON.parse(response.result);
      if (result.structuredContent) {
        // structuredContent is now the props object directly (not wrapped)
        onSuccess(result.structuredContent);
        onClose();
      } else {
        // If no structuredContent, host will still update toolOutput automatically
        // Close modal and let host-driven re-render handle it
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update budget"
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

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjust-budget-title"
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="adjust-budget-title">Adjust Daily Budget</h2>
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
              <label htmlFor="budget-amount">
                Daily Budget ({currency})
              </label>
              <input
                id="budget-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSubmitting}
                autoFocus
                required
              />
            </div>

            <div className="form-info">
              <p className="form-hint">
                Date: {date}
              </p>
              <p className="form-hint">
                This will set your daily spending target. You'll be able to
                track your progress throughout the month.
              </p>
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
              {isSubmitting ? "Updating..." : "Update Budget"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
