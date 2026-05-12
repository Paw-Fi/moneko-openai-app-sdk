/**
 * CategoryBreakdownChart Component
 *
 * DESIGN GUIDELINES COMPLIANCE:
 * ✅ Inline mode (single-purpose widget)
 * ✅ Local SVG visualization (no external chart APIs)
 * ✅ ≤2 primary actions
 * ✅ Monochromatic, outlined icons
 * ✅ System colors with accessible contrast
 * ✅ Concise, scannable content
 * ✅ Semantic HTML with ARIA labels
 * ✅ Progressive disclosure (overview → details)
 */

import { useState } from "react";
import { useWidgetProps } from "../lib/hooks";
import { callTool, openExternal } from "../lib/bridge";
import { PrivacyPopover } from "./PrivacyPopover";
import type { CategoryBreakdownChartProps } from "../lib/types";

// Shadcn UI Components
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Alert, AlertDescription } from "./ui/alert";

// Modern, accessible palette
const COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
];

export function CategoryBreakdownChart(inputProps: Partial<CategoryBreakdownChartProps>) {
  const widgetProps = useWidgetProps<CategoryBreakdownChartProps>();
  // If inputProps has data (breakdown array present), use it; otherwise fallback
  const props = (inputProps.breakdown ? inputProps : widgetProps) as CategoryBreakdownChartProps | undefined;
  const [isListLoading, setIsListLoading] = useState(false);
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!props || !props.breakdown || props.breakdown.length === 0) {
    return (
      <Card className="w-full max-w-md mx-auto">
         <CardContent className="h-64 flex flex-col items-center justify-center p-6 space-y-4">
            <Skeleton className="h-32 w-32 rounded-full" />
            <Skeleton className="h-4 w-3/4" />
         </CardContent>
      </Card>
    );
  }

  const { timeWindow, breakdown } = props;

  // Calculate if we should show upsell (any category share > 0.3)
  const hasHighCategorySpend = breakdown.some((b) =>
    b.totals.some((t) => t.share > 0.3)
  );

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
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

  const handleSeeAllTransactions = async () => {
    setIsListLoading(true);
    setErrorMessage(null);
    try {
      await callTool("moneko.list_expenses", {
        startDate: timeWindow.startDate,
        endDate: timeWindow.endDate,
        currency: breakdown[0]?.currency,
      });
    } catch (err) {
      console.error("Failed to list expenses:", err);
      setErrorMessage("Failed to load transactions. Please try again.");
    } finally {
      setIsListLoading(false);
    }
  };

  const handleUpgrade = async () => {
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
    <Card className="w-full max-w-md mx-auto" role="article" aria-label="Spending breakdown by category">
      <CardContent className="p-4 space-y-6">
        {/* Header - Concise, context-driven */}
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight" id="breakdown-title">Spending Breakdown</h1>
          <p className="text-sm text-muted-foreground">
            {timeWindow.startDate && timeWindow.endDate
              ? `${formatDate(timeWindow.startDate)} – ${formatDate(timeWindow.endDate)}`
              : "Current period"}
          </p>
        </header>

        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {/* Breakdown by Currency */}
        {breakdown.map((currencyBreakdown, idx) => (
          <div key={idx} className="space-y-6">
            <div className="flex flex-col items-center">
              {/* Donut Chart Visualization */}
              <div className="relative h-48 w-48">
                <svg width="100%" height="100%" viewBox="0 0 200 200" aria-hidden="true" className="-rotate-90">
                  <DonutSegments
                    totals={currencyBreakdown.totals}
                    colors={COLORS}
                  />
                  {/* Hollow center for total */}
                   <circle cx="100" cy="100" r="60" fill="transparent" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-sm font-medium text-muted-foreground">Total</span>
                  <span className="text-xl font-bold tracking-tight">
                    {formatAmount(
                      currencyBreakdown.totalAmountMajor,
                      currencyBreakdown.currency
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Category Bars - Scannable list format */}
            <ul className="space-y-3" role="list" aria-label="Spending by category">
              {currencyBreakdown.totals.map((category, catIdx) => (
                <li key={catIdx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: COLORS[catIdx % COLORS.length] }}
                          aria-hidden="true"
                      />
                      <span className="font-medium text-foreground truncate max-w-[120px] sm:max-w-xs">{category.category}</span>
                      <span className="text-xs text-muted-foreground">{(category.share * 100).toFixed(0)}%</span>
                    </div>
                    <span className="font-medium" aria-label={`${category.category}: ${formatAmount(category.amountMajor, currencyBreakdown.currency)}`}>
                      {formatAmount(
                        category.amountMajor,
                        currencyBreakdown.currency
                      )}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary overflow-hidden" role="img" aria-label={`${(category.share * 100).toFixed(1)}% of total spending`}>
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${category.share * 100}%`,
                        backgroundColor: COLORS[catIdx % COLORS.length],
                      }}
                      role="progressbar"
                      aria-valuenow={category.share * 100}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${category.category} spending progress`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Contextual Upsell - Transparent value proposition */}
        {hasHighCategorySpend && (
          <aside className="rounded-lg bg-accent/30 p-4 border border-accent/50 text-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="complementary" aria-label="Upgrade suggestion">
            <p className="text-muted-foreground leading-snug">
              <span className="font-medium text-foreground">Spending Alert:</span> Get nudges when {breakdown[0].totals.find((t) => t.share > 0.3)?.category} spending is high.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs shrink-0"
              onClick={handleUpgrade}
              disabled={isUpgradeLoading}
            >
              {isUpgradeLoading ? "Loading..." : "Enable Alerts"}
            </Button>
          </aside>
        )}

        {/* Primary Action - GUIDELINE: Single clear action */}
        <div className="pt-2" role="group" aria-labelledby="breakdown-title">
          <Button
            className="w-full"
            onClick={handleSeeAllTransactions}
            disabled={isListLoading}
            aria-label="View detailed list of all transactions"
          >
            {isListLoading ? "Loading..." : "See All Transactions"}
          </Button>
        </div>

        {/* Privacy Popover - Required per Section C.1.2 */}
        <div className="flex justify-center pt-2">
          <PrivacyPopover />
        </div>
      </CardContent>
    </Card>
  );
}

// Helper component for donut chart segments
function DonutSegments({
  totals,
  colors,
}: {
  totals: Array<{ category: string; amountMajor: number; share: number }>;
  colors: string[];
}) {
  const radius = 80;
  const strokeWidth = 25; // Slightly thinner for cleaner look
  const center = 100;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;

  return (
    <>
      {totals.map((category, idx) => {
        const percent = category.share;
        const offset = cumulativePercent * circumference;
        const dashArray = `${percent * circumference} ${circumference}`;

        cumulativePercent += percent;

        return (
          <circle
            key={idx}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={colors[idx % colors.length]}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeDashoffset={-offset}
            pathLength={circumference}
            className="transition-all duration-500 ease-out hover:opacity-80"
          />
        );
      })}
    </>
  );
}
