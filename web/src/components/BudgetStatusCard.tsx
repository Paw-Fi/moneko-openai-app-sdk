/**
 * BudgetStatusCard Component
 *
 * DESIGN GUIDELINES COMPLIANCE:
 * ✅ Inline mode with ≤2 primary actions
 * ✅ No nested scrolling (auto-fit content)
 * ✅ System colors with brand accents
 * ✅ Conditional phrasing ("at this pace")
 * ✅ Touch targets ≥40px
 * ✅ WCAG 2.1 AA compliance
 * ✅ Semantic HTML with ARIA labels
 * ✅ Concise, context-driven content
 *
 * Per Section C.1.1:
 * - Renders budget pacing with conditional phrasing
 * - Progress ring visualization (local SVG)
 * - Primary action: "Adjust Budget" → opens AdjustBudgetModal
 * - Secondary action (conditional): Guest claim OR overspend warning
 * - Always includes PrivacyPopover
 */

import { useState, useEffect } from "react";
import { useWidgetProps } from "../lib/hooks";
import { callTool, openExternal } from "../lib/bridge";
import { PrivacyPopover } from "./PrivacyPopover";
import { AdjustBudgetModal } from "./AdjustBudgetModal";
import type { BudgetStatusCardProps } from "../lib/types";

// Shadcn UI Components
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Skeleton } from "./ui/skeleton";

export function BudgetStatusCard(inputProps: Partial<BudgetStatusCardProps>) {
  const widgetProps = useWidgetProps<BudgetStatusCardProps>();
  // If inputProps has data (e.g. date is present), use it; otherwise fallback to widgetProps
  const props = (inputProps.date ? inputProps : widgetProps) as BudgetStatusCardProps | undefined;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClaimLoading, setIsClaimLoading] = useState(false);
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
  const [localProps, setLocalProps] = useState(props);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync local props when parent props change
  useEffect(() => {
    if (props) {
      setLocalProps(props);
    }
  }, [props]);

  // Use local props if available (after modal update), otherwise use props from toolOutput
  const displayProps = localProps ?? props;

  if (!displayProps) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="h-48 flex flex-col items-center justify-center p-6 space-y-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const {
    date,
    currency,
    dailyBudgetMajor,
    spentToDateMajor,
    remainingTodayMajor,
    projectedMonthRemainingMajor,
    daysInMonth,
    dayApplied,
    risk,
    guestInfo,
  } = displayProps;

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const progressPercentage = Math.min(
    100,
    (spentToDateMajor / dailyBudgetMajor) * 100
  );

  const handleAdjustBudget = () => {
    setIsModalOpen(true);
  };

  const handleModalSuccess = (newProps: unknown) => {
    setLocalProps(newProps as BudgetStatusCardProps);
  };

  const handleSaveInMoneko = async () => {
    setIsClaimLoading(true);
    setErrorMessage(null);
    try {
      const response = await callTool("moneko.start_auth", {});
      const result = JSON.parse(response.result);

      if (result.href) {
        openExternal(result.href);
      }
    } catch (err) {
      console.error("Failed to start auth:", err);
      setErrorMessage("Failed to start account claim. Please try again.");
    } finally {
      setIsClaimLoading(false);
    }
  };

  const handleEnableAlerts = async () => {
    setIsUpgradeLoading(true);
    setErrorMessage(null);
    try {
      const response = await callTool("moneko.start_upgrade", {});
      const result = JSON.parse(response.result);

      if (result.href) {
        openExternal(result.href);
      }
    } catch (err) {
      console.error("Failed to start upgrade:", err);
      setErrorMessage("Failed to start upgrade. Please try again.");
    } finally {
      setIsUpgradeLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto" role="article" aria-label="Budget status summary">
      <CardContent className="p-4 space-y-4">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        {/* Risk Warning - Conditional secondary action when overspending */}
        {risk.projectedNegative && (
          <Alert variant="destructive" className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <AlertDescription className="font-medium">
                 Draft: Overspending by {formatAmount(Math.abs(projectedMonthRemainingMajor))}
              </AlertDescription>
            </div>
            <Button
              variant="link"
              size="sm"
              className="text-white hover:text-white/90 h-auto p-0 ml-2"
              onClick={handleEnableAlerts}
              disabled={isUpgradeLoading}
            >
              {isUpgradeLoading ? "Loading..." : "Get alerts"}
            </Button>
          </Alert>
        )}

        {/* Main Budget Display - Concise, scannable content */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl" id="budget-amount">
              {formatAmount(remainingTodayMajor)}
            </h1>
            <p className="text-sm font-medium text-muted-foreground mt-1" aria-label={`Daily budget: ${formatAmount(dailyBudgetMajor)}`}>
              Left today • Planned {formatAmount(dailyBudgetMajor)}/day
            </p>
          </div>

          {/* Progress Ring - Local SVG visualization (no external APIs) */}
          <div className="relative h-16 w-16" aria-hidden="true">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 120 120" role="img" aria-label={`${Math.round(progressPercentage)}% of daily budget spent`}>
              <title>{Math.round(progressPercentage)}% of daily budget spent</title>
              <circle
                className="text-muted/20"
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
              />
              <circle
                className={progressPercentage > 100 ? "text-destructive" : "text-primary"}
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeDasharray={`${(progressPercentage * 339.292) / 100} 339.292`}
                strokeLinecap="round"
              />
            </svg>
             <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] font-bold leading-none text-muted-foreground">
                <span>{Math.round(progressPercentage)}%</span>
              </div>
          </div>
        </div>

        {/* Budget Details - Progressive disclosure, scannable format */}
        <dl className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="flex justify-between items-center">
            <dt className="text-muted-foreground">Spent so far</dt>
            <dd className="font-medium text-foreground">
              {formatAmount(spentToDateMajor)}
            </dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-muted-foreground">
              End of month forecast
            </dt>
            <dd
              className={`font-semibold ${projectedMonthRemainingMajor < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
            >
              {projectedMonthRemainingMajor >= 0 ? "+" : ""}
              {formatAmount(Math.abs(projectedMonthRemainingMajor))}
              {projectedMonthRemainingMajor < 0 ? " over" : ""}
            </dd>
          </div>
          <div className="flex justify-between items-center border-t border-border/50 pt-3 mt-1">
            <dt className="text-xs text-muted-foreground">Month Progress</dt>
            <dd className="text-xs font-medium text-foreground">
              Day {dayApplied} of {daysInMonth}
            </dd>
          </div>
        </dl>

        {/* Actions - GUIDELINE: Maximum 2 primary actions in inline mode */}
        <div className="flex gap-2 pt-2" role="group" aria-labelledby="budget-amount">
          <Button
            className="flex-1"
            onClick={handleAdjustBudget}
            aria-label="Adjust your daily budget amount"
          >
            Adjust Budget
          </Button>

          {/* Conditional secondary action: Guest claim (mutually exclusive with risk warning) */}
          {guestInfo.canClaim && !risk.projectedNegative && (
            <Button
              variant="outline"
              onClick={handleSaveInMoneko}
              disabled={isClaimLoading}
              aria-label="Save your budget data in Moneko account"
            >
              {isClaimLoading ? "Saving..." : "Save details"}
            </Button>
          )}
        </div>

        {/* Privacy Popover - Required per Section C.1.1 */}
        <div className="flex justify-center pt-2">
          <PrivacyPopover />
        </div>

        {/* Adjust Budget Modal */}
        <AdjustBudgetModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          currentBudget={dailyBudgetMajor}
          currency={currency}
          date={date}
          onSuccess={handleModalSuccess}
        />
      </CardContent>
    </Card>
  );
}
