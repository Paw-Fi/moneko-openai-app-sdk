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

import { useState } from "react";
import { useWidgetProps } from "../lib/hooks";
import { callTool, openExternal } from "../lib/bridge";
import { PrivacyPopover } from "./PrivacyPopover";
import { AdjustBudgetModal } from "./AdjustBudgetModal";
import type { BudgetStatusCardProps } from "../lib/types";

export function BudgetStatusCard() {
  const props = useWidgetProps<BudgetStatusCardProps>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClaimLoading, setIsClaimLoading] = useState(false);
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
  const [localProps, setLocalProps] = useState(props);

  // Use local props if available (after modal update), otherwise use props from toolOutput
  const displayProps = localProps ?? props;

  if (!displayProps) {
    return (
      <div className="budget-card loading">
        <p>Loading budget information...</p>
      </div>
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
    try {
      const response = await callTool("moneko.start_auth", {});
      const result = JSON.parse(response.result);

      if (result.href) {
        openExternal(result.href);
      }
    } catch (err) {
      console.error("Failed to start auth:", err);
      alert("Failed to start account claim. Please try again.");
    } finally {
      setIsClaimLoading(false);
    }
  };

  const handleEnableAlerts = async () => {
    setIsUpgradeLoading(true);
    try {
      const response = await callTool("moneko.start_upgrade", {});
      const result = JSON.parse(response.result);

      if (result.href) {
        openExternal(result.href);
      }
    } catch (err) {
      console.error("Failed to start upgrade:", err);
      alert("Failed to start upgrade. Please try again.");
    } finally {
      setIsUpgradeLoading(false);
    }
  };

  return (
    <div className="budget-card" role="article" aria-label="Budget status summary">
      {/* Risk Warning - Conditional secondary action when overspending */}
      {risk.projectedNegative && (
        <div className="risk-banner" role="alert" aria-live="polite">
          <div className="risk-content">
            <svg
              className="risk-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              At this pace, you're on track to overspend by{" "}
              {formatAmount(Math.abs(projectedMonthRemainingMajor))}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={handleEnableAlerts}
            disabled={isUpgradeLoading}
            aria-label="Enable overspend alerts"
          >
            {isUpgradeLoading ? "Loading..." : "Get alerts"}
          </button>
        </div>
      )}

      {/* Main Budget Display - Concise, scannable content */}
      <div className="budget-summary">
        <div className="budget-main">
          <h1 className="budget-remaining" id="budget-amount">
            {formatAmount(remainingTodayMajor)} left today
          </h1>
          <p className="budget-planned" aria-label={`Daily budget: ${formatAmount(dailyBudgetMajor)}`}>
            You planned {formatAmount(dailyBudgetMajor)}/day
          </p>
        </div>

        {/* Progress Ring - Local SVG visualization (no external APIs) */}
        <div className="budget-progress" aria-hidden="true">
          <div className="progress-ring">
            <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${Math.round(progressPercentage)}% of daily budget spent`}>
              <title>{Math.round(progressPercentage)}% of daily budget spent</title>
              <circle
                className="progress-ring-bg"
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                opacity="0.1"
              />
              <circle
                className="progress-ring-fill"
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${(progressPercentage * 339.292) / 100} 339.292`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
                style={{
                  stroke: progressPercentage > 100 ? "var(--color-error)" : "var(--color-success)",
                }}
              />
            </svg>
            <div className="progress-text" aria-hidden="true">
              <span className="progress-percent">
                {Math.round(progressPercentage)}%
              </span>
              <span className="progress-label">spent</span>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Details - Progressive disclosure, scannable format */}
      <dl className="budget-details">
        <div className="detail-item">
          <dt className="detail-label">Spent so far</dt>
          <dd className="detail-value">
            {formatAmount(spentToDateMajor)}
          </dd>
        </div>
        <div className="detail-item">
          <dt className="detail-label">
            {/* GUIDELINE: Conditional phrasing (not definitive predictions) */}
            At this pace, by month end
          </dt>
          <dd
            className="detail-value"
            style={{
              color: projectedMonthRemainingMajor < 0 ? "var(--color-error)" : "var(--color-success)",
            }}
          >
            {projectedMonthRemainingMajor >= 0 ? "~" : ""}
            {formatAmount(Math.abs(projectedMonthRemainingMajor))}
            {projectedMonthRemainingMajor < 0 ? " over" : " remaining"}
          </dd>
        </div>
        <div className="detail-item">
          <dt className="detail-label">Progress</dt>
          <dd className="detail-value">
            Day {dayApplied} of {daysInMonth}
          </dd>
        </div>
      </dl>

      {/* Actions - GUIDELINE: Maximum 2 primary actions in inline mode */}
      <div className="budget-actions" role="group" aria-labelledby="budget-amount">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleAdjustBudget}
          aria-label="Adjust your daily budget amount"
        >
          Adjust Budget
        </button>

        {/* Conditional secondary action: Guest claim (mutually exclusive with risk warning) */}
        {guestInfo.canClaim && !risk.projectedNegative && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSaveInMoneko}
            disabled={isClaimLoading}
            aria-label="Save your budget data in Moneko account"
          >
            {isClaimLoading ? "Saving..." : "Save in Moneko"}
          </button>
        )}
      </div>

      {/* Privacy Popover - Required per Section C.1.1 */}
      <div className="budget-footer">
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
    </div>
  );
}
