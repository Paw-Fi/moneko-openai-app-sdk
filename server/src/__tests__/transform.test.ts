import { describe, it, expect } from 'vitest';
import {
  toBudgetStatusCard,
  toExpenseTablePayload,
  toCategoryBreakdownPayload,
} from '../lib/transform.js';

describe('Transform Functions', () => {
  describe('toBudgetStatusCard', () => {
    it('should transform budget response with nested results', () => {
      const input = {
        ok: true,
        results: {
          date: '2025-10-30',
          currency: 'EUR',
          dailyBudgetCents: 3000,
          daysInMonth: 31,
          dayApplied: 30,
          totals: {
            spentToDateCents: 1850,
            remainingToDateCents: 1150,
            projectedMonthRemainingCents: 12000,
          },
        },
        meta: {
          guest: {
            createdUser: true,
          },
        },
      };

      const result = toBudgetStatusCard(input);

      expect(result.date).toBe('2025-10-30');
      expect(result.currency).toBe('EUR');
      expect(result.dailyBudgetMajor).toBe(30.00);
      expect(result.spentToDateMajor).toBe(18.50);
      expect(result.remainingTodayMajor).toBe(11.50);
      expect(result.projectedMonthRemainingMajor).toBe(120.00);
      expect(result.risk.projectedNegative).toBe(false);
      expect(result.guestInfo.isGuest).toBe(true);
      expect(result.guestInfo.canClaim).toBe(true);
    });

    it('should handle negative projected remaining', () => {
      const input = {
        results: {
          dailyBudgetCents: 3000,
          totals: {
            projectedMonthRemainingCents: -8500,
          },
        },
      };

      const result = toBudgetStatusCard(input);

      expect(result.projectedMonthRemainingMajor).toBe(-85.00);
      expect(result.risk.projectedNegative).toBe(true);
    });

    it('should handle bare results object', () => {
      const input = {
        date: '2025-10-30',
        dailyBudgetCents: 3000,
        totals: {
          spentToDateCents: 1850,
        },
      };

      const result = toBudgetStatusCard(input);

      expect(result.date).toBe('2025-10-30');
      expect(result.dailyBudgetMajor).toBe(30.00);
    });
  });

  describe('toExpenseTablePayload', () => {
    it('should transform expense list response', () => {
      const input = {
        data: [
          {
            id: '123',
            date: '2025-10-30',
            description: 'Coffee',
            category: 'Food',
            amount_cents: 450,
            currency: 'EUR',
          },
          {
            id: '456',
            date: '2025-10-29',
            raw_text: 'Bus ticket',
            category: 'Transport',
            amountMajor: 2.50,
            currency: 'EUR',
          },
        ],
        meta: {
          filters: {
            startDate: '2025-10-01',
            endDate: '2025-10-31',
            currency: 'EUR',
          },
        },
      };

      const result = toExpenseTablePayload(input);

      expect(result.props.rows).toHaveLength(2);
      expect(result.expenseRefs).toHaveLength(2);
      expect(result.expenseRefs[0]).toMatch(/^exp_/);
      expect(result.props.rows[0].amountMajor).toBe(4.5);
      expect(result.props.rows[1].description).toBe('Bus ticket');
      expect(result.props.rows[1].amountMajor).toBe(2.5);
      expect(result.props.window.startDate).toBe('2025-10-01');
      expect(result.props.window.currency).toBe('EUR');
    });

    it('should handle empty data', () => {
      const input = {
        data: [],
      };

      const result = toExpenseTablePayload(input);

      expect(result.props.rows).toHaveLength(0);
      expect(result.expenseRefs).toHaveLength(0);
      expect(result.props.window.startDate).toBeNull();
    });
  });

  describe('toCategoryBreakdownPayload', () => {
    it('should transform expense summary response', () => {
      const input = {
        data: {
          timeWindow: {
            startDate: '2025-10-01',
            endDate: '2025-10-31',
          },
          breakdown: [
            {
              currency: 'EUR',
              totalAmountCents: 74213,
              totals: [
                {
                  category: 'Food',
                  amountCents: 35000,
                  share: 0.47,
                },
                {
                  category: 'Transport',
                  amountCents: 20000,
                  share: 0.27,
                },
              ],
            },
          ],
        },
      };

      const result = toCategoryBreakdownPayload(input);

      expect(result.timeWindow.startDate).toBe('2025-10-01');
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].currency).toBe('EUR');
      expect(result.breakdown[0].totalAmountMajor).toBe(742.13);
      expect(result.breakdown[0].totals).toHaveLength(2);
      expect(result.breakdown[0].totals[0].amountMajor).toBe(350.00);
      expect(result.breakdown[0].totals[0].share).toBe(0.47);
    });

    it('should handle amountMajor fields', () => {
      const input = {
        breakdown: [
          {
            currency: 'EUR',
            totalAmountMajor: 742.13,
            totals: [
              {
                category: 'Food',
                amountMajor: 350.00,
                share: 0.47,
              },
            ],
          },
        ],
      };

      const result = toCategoryBreakdownPayload(input);

      expect(result.breakdown[0].totalAmountMajor).toBe(742.13);
      expect(result.breakdown[0].totals[0].amountMajor).toBe(350.00);
    });
  });
});
