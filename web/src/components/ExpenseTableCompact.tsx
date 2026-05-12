/**
 * ExpenseTableCompact Component
 *
 * DESIGN GUIDELINES COMPLIANCE:
 * ✅ Full width table with sticky headers
 * ✅ Row hover effects for better usability
 * ✅ Clear empty states with actions
 * ✅ Accessible action buttons (Edit/Delete)
 * ✅ System font with tabular numerals for data
 * ✅ Semantic HTML structure
 * ✅ Responsive overflow handling
 */

import { useState } from "react";
import { useWidgetProps } from "../lib/hooks";
import { callTool } from "../lib/bridge";
import { PrivacyPopover } from "./PrivacyPopover";
import { EditExpenseModal } from "./EditExpenseModal";
import type { ExpenseTableCompactProps, ExpenseRow } from "../lib/types";

// Shadcn UI Components
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Skeleton } from "./ui/skeleton";

type EditableExpense = ExpenseRow & { expenseRef: string };

export function ExpenseTableCompact(inputProps: Partial<ExpenseTableCompactProps>) {
  const widgetProps = useWidgetProps<ExpenseTableCompactProps>();
  // If inputProps has data (rows present), use it; otherwise fallback
  const props = (inputProps.rows ? inputProps : widgetProps) as ExpenseTableCompactProps | undefined;
  const [editingExpense, setEditingExpense] = useState<EditableExpense | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!props) {
    return (
      <Card className="w-full h-full flex flex-col">
         <CardContent className="flex h-64 w-full items-center justify-center p-6 space-y-4">
             <div className="space-y-2 w-full">
                 <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-10 w-full" />
             </div>
         </CardContent>
      </Card>
    );
  }

  const { rows, window: timeWindow } = props;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const handleDelete = async (expense: ExpenseRow, index: number) => {
    // Generate a reference if not provided (fallback)
    const expenseRef =
      (expense as any).expenseRef || `row_${index}_${expense.date}`;

    if (!confirm("Are you sure you want to delete this expense?")) {
      return;
    }

    try {
      setErrorMessage(null);
      await callTool("moneko.delete_expense", {
        expenseRef,
        refreshWindow: timeWindow,
      });
      // Host will update the UI via new toolOutput
    } catch (err) {
      console.error("Failed to delete expense:", err);
      setErrorMessage("Failed to delete expense. Please try again.");
    }
  };

  const handleEdit = (expense: ExpenseRow, index: number) => {
    const expenseRef =
      (expense as any).expenseRef || `row_${index}_${expense.date}`;
    setEditingExpense({ ...expense, expenseRef });
  };

  const handleEditSuccess = () => {
    setEditingExpense(null);
    // Host will update the UI via new toolOutput from refreshWindow
  };

  if (rows.length === 0) {
    return (
      <Card className="w-full h-full flex flex-col justify-center items-center text-center p-8 space-y-6">
        <div className="bg-muted p-4 rounded-full">
          <svg
            className="h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">No transactions found</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Transactions for this period will appear here once recorded.
          </p>
        </div>
        <div className="pt-4">
          <PrivacyPopover />
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full h-full flex flex-col overflow-hidden border-0 shadow-none sm:border sm:shadow-sm" role="article">
      <CardHeader className="px-6 py-4 border-b flex flex-row items-center justify-between bg-muted/20 space-y-0">
        <div>
          <CardTitle className="text-lg tracking-tight" id="table-title">Transactions</CardTitle>
          {timeWindow.startDate && timeWindow.endDate && (
            <p className="text-xs text-muted-foreground mt-1">
              {formatDate(timeWindow.startDate)} – {formatDate(timeWindow.endDate)}
            </p>
          )}
        </div>
        {errorMessage && (
           <Alert variant="destructive" className="py-1 px-3 w-auto h-auto flex items-center">
             <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
           </Alert>
        )}
      </CardHeader>
      
      <div className="flex-1 overflow-auto">
        <Table aria-labelledby="table-title">
          <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur-sm">
            <TableRow>
              <TableHead className="w-[15%]">Date</TableHead>
              <TableHead className="w-[40%]">Description</TableHead>
              <TableHead className="w-[20%]">Category</TableHead>
              <TableHead className="text-right w-[15%]">Amount</TableHead>
              <TableHead className="text-right w-[10%]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((expense, index) => {
              return (
                <TableRow key={index} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(expense.date)}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    <span className="line-clamp-1">{expense.description}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal rounded-full">
                       {expense.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatAmount(expense.amountMajor, expense.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => handleEdit(expense, index)}
                        title={`Edit expense: ${expense.description}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(expense, index)}
                         title={`Delete expense: ${expense.description}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      <CardFooter className="px-6 py-4 border-t bg-muted/20 flex justify-center">
        <PrivacyPopover />
      </CardFooter>
      
      <EditExpenseModal
        isOpen={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        expense={editingExpense}
        onSuccess={handleEditSuccess}
        refreshWindow={timeWindow}
      />
    </Card>
  );
}
