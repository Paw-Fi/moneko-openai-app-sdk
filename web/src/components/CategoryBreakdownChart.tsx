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
 *
 * Per Section C.1.2:
 * - Renders spending breakdown by category
 * - Local SVG/Canvas visualization (NO remote chart APIs)
 * - Primary action: "See all transactions" → calls moneko.list_expenses
 * - Conditional upsell if any category share > 0.3
 * - Always includes PrivacyPopover
 */

import { useState } from "react";
import { useWidgetProps } from "../lib/hooks";
import { callTool, openExternal } from "../lib/bridge";
import { PrivacyPopover } from "./PrivacyPopover";
import type { CategoryBreakdownChartProps } from "../lib/types";

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

export function CategoryBreakdownChart() {
  const props = useWidgetProps<CategoryBreakdownChartProps>();
  const [isListLoading, setIsListLoading] = useState(false);
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!props || !props.breakdown || props.breakdown.length === 0) {
    return (
      <div className="breakdown-chart loading">
        <p>Loading spending breakdown...</p>
      </div>
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
      // After this call, OpenAI will render the ExpenseTableCompact widget
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
    <div className="breakdown-chart" role="article" aria-label="Spending breakdown by category">
      {/* Header - Concise, context-driven */}
      <header className="breakdown-header">
        <h1 className="breakdown-title" id="breakdown-title">Spending Breakdown</h1>
        <p className="breakdown-period">
          {timeWindow.startDate && timeWindow.endDate
            ? `${formatDate(timeWindow.startDate)} to ${formatDate(timeWindow.endDate)}`
            : "Current period"}
        </p>
      </header>

      {errorMessage && (
        <div className="form-error" role="alert" aria-live="polite">
          {errorMessage}
        </div>
      )}

      {/* Breakdown by Currency */}
      {breakdown.map((currencyBreakdown, idx) => (
        <div key={idx} className="currency-breakdown">
          <div className="breakdown-summary">
            <span className="breakdown-total">
              {formatAmount(
                currencyBreakdown.totalAmountMajor,
                currencyBreakdown.currency
              )}
            </span>
            <span className="breakdown-currency">
              Total in {currencyBreakdown.currency}
            </span>
          </div>

          {/* Category Bars - Scannable list format */}
          <ul className="category-list" role="list" aria-label="Spending by category">
            {currencyBreakdown.totals.map((category, catIdx) => (
              <li key={catIdx} className="category-item">
                <div className="category-header">
                  <span className="category-name">{category.category}</span>
                  <span className="category-amount" aria-label={`${category.category}: ${formatAmount(category.amountMajor, currencyBreakdown.currency)}`}>
                    {formatAmount(
                      category.amountMajor,
                      currencyBreakdown.currency
                    )}
                  </span>
                </div>
                <div className="category-bar-container" role="img" aria-label={`${(category.share * 100).toFixed(1)}% of total spending`}>
                  <div
                    className="category-bar"
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
                <span className="category-percentage" aria-hidden="true">
                  {(category.share * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>

          {/* Donut Chart Visualization */}
          <div className="donut-chart">
            <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
              <DonutSegments
                totals={currencyBreakdown.totals}
                colors={COLORS}
              />
            </svg>
          </div>
        </div>
      ))}

      {/* Contextual Upsell - Transparent value proposition */}
      {hasHighCategorySpend && (
        <aside className="upsell-banner" role="complementary" aria-label="Upgrade suggestion">
          <p className="upsell-text">
            Get nudges when {breakdown[0].totals.find((t) => t.share > 0.3)?.category} spending is high
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={handleUpgrade}
            disabled={isUpgradeLoading}
            aria-label="Upgrade to get spending alerts"
          >
            {isUpgradeLoading ? "Loading..." : "Learn more"}
          </button>
        </aside>
      )}

      {/* Primary Action - GUIDELINE: Single clear action */}
      <div className="breakdown-actions" role="group" aria-labelledby="breakdown-title">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSeeAllTransactions}
          disabled={isListLoading}
          aria-label="View detailed list of all transactions"
        >
          {isListLoading ? "Loading..." : "See All Transactions"}
        </button>
      </div>

      {/* Privacy Popover - Required per Section C.1.2 */}
      <div className="breakdown-footer">
        <PrivacyPopover />
      </div>
    </div>
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
  const strokeWidth = 30;
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
            transform={`rotate(-90 ${center} ${center})`}
          />
        );
      })}
    </>
  );
}
