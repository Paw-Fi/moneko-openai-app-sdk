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
 */

import { useState, useEffect } from "react";
import { callTool } from "../lib/bridge";
import type { ExpenseRow } from "../lib/types";

// Shadcn UI Components
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Alert, AlertDescription } from "./ui/alert";

type EditableExpense = ExpenseRow & { expenseRef: string };

interface EditExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: EditableExpense | null;
  onSuccess: () => void;
  refreshWindow?: { startDate: string | null; endDate: string | null; currency: string | null } | null;
}

export function EditExpenseModal({
  isOpen,
  onClose,
  expense,
  onSuccess,
  refreshWindow,
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
        expenseRef: expense.expenseRef,
        updates,
        refreshWindow: refreshWindow ?? undefined,
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

  if (!isOpen || !expense) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
          <DialogDescription>
            Modify details for this transaction.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expense-category" className="text-right">
                Category
              </Label>
              <Input
                id="expense-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isSubmitting}
                required
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expense-amount" className="text-right">
                Amount ({expense.currency})
              </Label>
              <Input
                id="expense-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSubmitting}
                required
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expense-date" className="text-right">
                Date
              </Label>
              <Input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isSubmitting}
                required
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expense-description" className="text-right">
                Description
              </Label>
              <Input
                id="expense-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
                className="col-span-3"
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
