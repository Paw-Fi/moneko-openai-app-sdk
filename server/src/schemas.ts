import { z } from 'zod';

/**
 * Schema for saving expenses
 * Requires explicit date and currency - never inferred
 */
export const SaveExpenseInput = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  currency: z.string().length(3),
  date: z.string().min(1),           // "YYYY-MM-DD" or ISO datetime
  clientCreatedAt: z.string().optional(),
  description: z.string().optional(),
  receiptImageUrl: z.string().url().optional(),
});

export type SaveExpenseInput = z.infer<typeof SaveExpenseInput>;

/**
 * Schema for saving income
 * Mirrors save-income edge function
 */
export const SaveIncomeInput = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  currency: z.string().length(3),
  date: z.string().min(1),           // "YYYY-MM-DD" or ISO datetime
  description: z.string().optional(),
  source: z.string().optional(),
  ownerType: z.enum(['me', 'partner', 'household']).optional(),
  privacyScope: z.enum(['private', 'balances_only', 'full']).optional(),
  householdId: z.string().uuid().optional(),
});

export type SaveIncomeInput = z.infer<typeof SaveIncomeInput>;

/**
 * Schema for listing expenses with optional filters
 */
export const ListExpensesInput = z.object({
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export type ListExpensesInput = z.infer<typeof ListExpensesInput>;

/**
 * Schema for expense summary/breakdown
 * endDate is required (upper bound), startDate optional (lower bound)
 */
export const ExpenseSummaryInput = z.object({
  startDate: z.string().optional(),  // "lower bound"
  endDate: z.string().min(1),        // "upper bound" required
  currency: z.string().length(3).optional(),
  maxRows: z.number().int().optional(),
});

export type ExpenseSummaryInput = z.infer<typeof ExpenseSummaryInput>;

/**
 * Schema for getting budget status
 * Date is required - we do not infer server 'today'
 */
export const GetBudgetInput = z.object({
  date: z.string().min(1),           // required, we do not infer server 'today'
  currency: z.string().length(3).optional(),
  day: z.number().int().optional(),  // projection day override
});

export type GetBudgetInput = z.infer<typeof GetBudgetInput>;

/**
 * Schema for setting budget
 * Amount is in major units (e.g. 25.50 EUR, not cents)
 */
export const SetBudgetInput = z.object({
  amount: z.number().positive(),     // major units, e.g. 25.50
  date: z.string().min(1),
  currency: z.string().length(3),
});

export type SetBudgetInput = z.infer<typeof SetBudgetInput>;

/**
 * Schema for updating expenses
 * At least one update field must be provided
 */
export const UpdateExpenseInput = z.object({
  expenseId: z.string().uuid(),
  updates: z.object({
    amount_cents: z.number().int().positive().optional(),
    category: z.string().optional(),
    raw_text: z.string().optional(),
    date: z.string().optional(),         // "YYYY-MM-DD"
    currency: z.string().length(3).optional(),
  }).refine(v => Object.keys(v).length > 0, "updates must include at least one field"),
});

export type UpdateExpenseInput = z.infer<typeof UpdateExpenseInput>;

/**
 * Schema for deleting expenses
 */
export const DeleteExpenseInput = z.object({
  expenseId: z.string().uuid(),
});

export type DeleteExpenseInput = z.infer<typeof DeleteExpenseInput>;

/**
 * Schema for starting authentication (guest claim)
 * No input parameters needed
 */
export const StartAuthInput = z.object({});

export type StartAuthInput = z.infer<typeof StartAuthInput>;

/**
 * Schema for starting upgrade flow
 * No input parameters needed
 */
export const StartUpgradeInput = z.object({});

export type StartUpgradeInput = z.infer<typeof StartUpgradeInput>;
