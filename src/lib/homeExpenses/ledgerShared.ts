/**
 * Ledger shapes and defaults without Node or DB imports — safe for client URL
 * helpers and UI props (**29b** / **29c**).
 */

export type HomeExpensesLedgerPaymentFilter = "all" | "unpaid" | "paid";

/** Default ledger page size; max matches `MAX_CHARGES_LEDGER_PAGE_SIZE`. */
export const DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE = 50;

export type HomeExpenseLedgerRow = {
  id: string;
  expenseTypeId: string;
  expenseTypeName: string;
  amountMinor: number;
  incurredOn: string;
  paidOn: string | null;
  vendor: string | null;
  invoiceReference: string | null;
  note: string | null;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};

export type HomeExpenseTypeTotal = {
  expenseTypeId: string;
  name: string;
  totalMinor: number;
};

export type HomeExpensesLedgerSummary = {
  grandTotalMinor: number;
  breakdown: HomeExpenseTypeTotal[];
};
