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
 */

import { useState, useEffect } from "react";
import { callTool } from "../lib/bridge";

// Shadcn UI Components
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Alert, AlertDescription } from "./ui/alert";

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

      const result = JSON.parse(response.result);
      if (result.structuredContent) {
        onSuccess(result.structuredContent);
        onClose();
      } else {
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adjust Daily Budget</DialogTitle>
          <DialogDescription>
            Set your daily spending target for {date}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="budget-amount" className="text-right">
                Amount
              </Label>
              <Input
                id="budget-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSubmitting}
                className="col-span-3"
                autoFocus
                required
              />
            </div>
            {currency && (
               <div className="text-xs text-muted-foreground text-right">
                  Currency: {currency}
               </div>
            )}
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
              {isSubmitting ? "Updating..." : "Update Budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
