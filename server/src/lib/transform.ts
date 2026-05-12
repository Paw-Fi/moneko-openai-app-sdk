/**
 * Transform functions to convert Supabase responses into widget props
 */
import { makeExpenseRef } from './refs.js';

/**
 * Round to 2 decimal places
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Transform budget response to BudgetStatusCard props
 */
export function toBudgetStatusCard(result: any) {
  // Support both { ok, results, meta } and bare results
  const r = result?.results ?? result;
  const totals = r?.totals ?? {};

  const dailyBudgetCents = r?.dailyBudgetCents ?? 0;
  const spentCents = totals.spentToDateCents ?? totals.spent_cents ?? 0;
  const remainingCents = totals.remainingToDateCents ?? totals.remaining_cents ?? 0;
  const projectedCents = totals.projectedMonthRemainingCents ?? 0;

  const projectedNegative = projectedCents < 0;

  return {
    date: r?.date,
    currency: r?.currency,
    dailyBudgetMajor: round2(dailyBudgetCents / 100),
    spentToDateMajor: round2(spentCents / 100),
    remainingTodayMajor: round2(remainingCents / 100),
    projectedMonthRemainingMajor: round2(projectedCents / 100),
    daysInMonth: r?.daysInMonth,
    dayApplied: r?.dayApplied,
    risk: { projectedNegative },
    guestInfo: {
      // We infer guest vs registered from meta if present.
      // Convention: meta.guest?.createdUser === true => this user is still a guest.
      isGuest: !!result?.meta?.guest,
      canClaim: !!result?.meta?.guest,
    },
  };
}

/**
 * Transform list expenses response to ExpenseTableCompact props
 */
export function toExpenseTablePayload(result: any) {
  const data = result?.data ?? [];
  const expenseRefs = data.map((row: any) => (row?.id ? makeExpenseRef(String(row.id)) : null));

  const rows = data.map((row: any) => ({
    date: row.date,
    description: row.description ?? row.raw_text ?? "",
    category: row.category,
    amountMajor: row.amountMajor ?? (row.amount_cents ? round2(row.amount_cents / 100) : 0),
    currency: row.currency,
  }));

  const props = {
    rows,
    window: {
      startDate: result?.meta?.filters?.startDate ?? null,
      endDate: result?.meta?.filters?.endDate ?? null,
      currency: result?.meta?.filters?.currency ?? null,
    },
  };

  return { props, expenseRefs };
}

/**
 * Transform expense summary response to CategoryBreakdownChart props
 */
export function toCategoryBreakdownPayload(result: any) {
  const d = result?.data ?? result;
  const breakdown = (d?.breakdown ?? []).map((b: any) => ({
    currency: b.currency,
    totalAmountMajor: b.totalAmountMajor ?? round2((b.totalAmountCents ?? 0) / 100),
    totals: (b.totals ?? []).map((t: any) => ({
      category: t.category,
      amountMajor: t.amountMajor ?? round2((t.amountCents ?? 0) / 100),
      share: t.share ?? 0,
    })),
  }));

  return {
    timeWindow: d?.timeWindow ?? {},
    breakdown,
  };
}
