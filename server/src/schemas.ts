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

/**
 * MVP Schema: log_expense
 */
export const LogExpenseInput = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  category: z.string().min(1),
  merchant: z.string().min(1).optional(),
  date: z.string().min(1),
  note: z.string().min(1).optional(),
});

export type LogExpenseInput = z.infer<typeof LogExpenseInput>;

/**
 * MVP Schema: list_expenses
 */
export const ListExpensesMvpInput = z.object({
  range: z
    .object({
      startDate: z.string().min(1).optional(),
      endDate: z.string().min(1).optional(),
    })
    .optional(),
  category: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export type ListExpensesMvpInput = z.infer<typeof ListExpensesMvpInput>;

/**
 * MVP Schema: get_summary
 */
export const GetSummaryInput = z.object({
  range: z
    .object({
      startDate: z.string().min(1).optional(),
      endDate: z.string().min(1).optional(),
    })
    .optional(),
});

export type GetSummaryInput = z.infer<typeof GetSummaryInput>;

/**
 * MVP Schema: create_category
 */
export const CreateCategoryInput = z.object({
  name: z.string().min(1).max(40),
});

export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

/**
 * MVP Schema: list_categories
 */
export const ListCategoriesInput = z.object({});

export type ListCategoriesInput = z.infer<typeof ListCategoriesInput>;

/**
 * Embedded auth: store Supabase access token for this chat
 */
export const SetAuthSessionInput = z.object({
  access_token: z.string().min(1),
});

export type SetAuthSessionInput = z.infer<typeof SetAuthSessionInput>;

export const ClearAuthSessionInput = z.object({});

export type ClearAuthSessionInput = z.infer<typeof ClearAuthSessionInput>;

export const AuthStatusInput = z.object({});

export type AuthStatusInput = z.infer<typeof AuthStatusInput>;

/**
 * WhatsApp-bot parity tools (for ChatGPT App MCP)
 */
export const AddTransactionInput = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().optional(),
  date: z.string().optional(),
  currency: z.string().length(3).optional(),
  household_id: z.string().optional(),
  household_name: z.string().optional(),
  is_recurring: z.boolean().optional(),
  frequency: z.string().optional(),
});

export type AddTransactionInput = z.infer<typeof AddTransactionInput>;

export const UpdateTransactionInput = z.object({
  expense_id: z.string().min(1),
  amount: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  currency: z.string().length(3).optional(),
  household_id: z.string().optional(),
  household_name: z.string().optional(),
});

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionInput>;

export const DeleteTransactionInput = z.object({
  expense_id: z.string().min(1),
});

export type DeleteTransactionInput = z.infer<typeof DeleteTransactionInput>;

export const ListTransactionsInput = z.object({
  type: z.enum(['expense', 'income']).optional(),
  currency: z.string().length(3).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  household_id: z.string().optional(),
  household_name: z.string().optional(),
});

export type ListTransactionsInput = z.infer<typeof ListTransactionsInput>;

export const SetCurrencyInput = z.object({
  currency: z.string().length(3),
});

export type SetCurrencyInput = z.infer<typeof SetCurrencyInput>;

export const GenerateChartUrlInput = z.object({
  chart_type: z.enum(['bar', 'pie', 'donut', 'radar']),
  labels: z.array(z.string().min(1)),
  data: z.array(z.number()),
  title: z.string().optional(),
});

export type GenerateChartUrlInput = z.infer<typeof GenerateChartUrlInput>;

export const FinancialInsightInput = z.object({
  scope: z.string().optional(),
});

export type FinancialInsightInput = z.infer<typeof FinancialInsightInput>;

export const ManageRecurringInput = z.object({
  action: z.enum(['add', 'delete']),
  expense_id: z.string().optional(),
  amount: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  frequency: z.enum(['weekly', 'monthly', 'yearly']).optional(),
  type: z.enum(['expense', 'income']).optional(),
});

export type ManageRecurringInput = z.infer<typeof ManageRecurringInput>;
