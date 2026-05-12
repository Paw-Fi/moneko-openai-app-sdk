import { describe, it, expect } from 'vitest';
import {
  SaveExpenseInput,
  ListExpensesInput,
  ExpenseSummaryInput,
  GetBudgetInput,
  SetBudgetInput,
  UpdateExpenseInput,
  DeleteExpenseInput,
} from '../schemas.js';

describe('Schema Validation', () => {
  describe('SaveExpenseInput', () => {
    it('should validate correct input', () => {
      const input = {
        amount: 12.50,
        category: 'Food',
        currency: 'EUR',
        date: '2025-10-30',
      };
      expect(() => SaveExpenseInput.parse(input)).not.toThrow();
    });

    it('should reject negative amount', () => {
      const input = {
        amount: -12.50,
        category: 'Food',
        currency: 'EUR',
        date: '2025-10-30',
      };
      expect(() => SaveExpenseInput.parse(input)).toThrow();
    });

    it('should reject invalid currency', () => {
      const input = {
        amount: 12.50,
        category: 'Food',
        currency: 'EU',  // Too short
        date: '2025-10-30',
      };
      expect(() => SaveExpenseInput.parse(input)).toThrow();
    });

    it('should reject missing required fields', () => {
      const input = {
        amount: 12.50,
        // Missing category, currency, date
      };
      expect(() => SaveExpenseInput.parse(input)).toThrow();
    });
  });

  describe('GetBudgetInput', () => {
    it('should validate correct input', () => {
      const input = {
        date: '2025-10-30',
        currency: 'EUR',
      };
      expect(() => GetBudgetInput.parse(input)).not.toThrow();
    });

    it('should require date', () => {
      const input = {
        currency: 'EUR',
      };
      expect(() => GetBudgetInput.parse(input)).toThrow();
    });
  });

  describe('SetBudgetInput', () => {
    it('should validate correct input', () => {
      const input = {
        amount: 30.00,
        date: '2025-10-30',
        currency: 'EUR',
      };
      expect(() => SetBudgetInput.parse(input)).not.toThrow();
    });

    it('should reject negative amount', () => {
      const input = {
        amount: -30.00,
        date: '2025-10-30',
        currency: 'EUR',
      };
      expect(() => SetBudgetInput.parse(input)).toThrow();
    });
  });

  describe('ListExpensesInput', () => {
    it('should validate with optional fields', () => {
      const input = {
        startDate: '2025-10-01',
        endDate: '2025-10-31',
        currency: 'EUR',
        limit: 50,
      };
      expect(() => ListExpensesInput.parse(input)).not.toThrow();
    });

    it('should validate with no fields', () => {
      const input = {};
      expect(() => ListExpensesInput.parse(input)).not.toThrow();
    });

    it('should reject limit over 200', () => {
      const input = {
        limit: 250,
      };
      expect(() => ListExpensesInput.parse(input)).toThrow();
    });
  });

  describe('ExpenseSummaryInput', () => {
    it('should validate with required endDate', () => {
      const input = {
        endDate: '2025-10-31',
      };
      expect(() => ExpenseSummaryInput.parse(input)).not.toThrow();
    });

    it('should require endDate', () => {
      const input = {
        startDate: '2025-10-01',
      };
      expect(() => ExpenseSummaryInput.parse(input)).toThrow();
    });
  });

  describe('UpdateExpenseInput', () => {
    it('should validate with at least one update field', () => {
      const input = {
        expenseRef: 'exp_dummy_ref',
        updates: {
          category: 'Transport',
        },
      };
      expect(() => UpdateExpenseInput.parse(input)).not.toThrow();
    });

    it('should reject empty updates', () => {
      const input = {
        expenseRef: 'exp_dummy_ref',
        updates: {},
      };
      expect(() => UpdateExpenseInput.parse(input)).toThrow();
    });

    it('should reject invalid expenseRef', () => {
      const input = {
        expenseRef: 'not-a-ref',
        updates: {
          category: 'Transport',
        },
      };
      expect(() => UpdateExpenseInput.parse(input)).toThrow();
    });
  });

  describe('DeleteExpenseInput', () => {
    it('should validate correct expenseRef', () => {
      const input = {
        expenseRef: 'exp_dummy_ref',
      };
      expect(() => DeleteExpenseInput.parse(input)).not.toThrow();
    });

    it('should reject invalid expenseRef', () => {
      const input = {
        expenseRef: 'not-a-ref',
      };
      expect(() => DeleteExpenseInput.parse(input)).toThrow();
    });
  });
});
