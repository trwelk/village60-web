/** `billing_transactions.source_kind` for monthly salary accrual charges. */
export const SALARY_ACCRUAL_SOURCE_KIND = "salary_accrual";

/** @deprecated Legacy expense-path remittances; retained for migration detection only. */
export const SALARY_REMITTANCE_SOURCE_KIND = "salary_remittance";

/** Financial analytics category label for salary ledger expenses. */
export const STAFF_SALARIES_EXPENSE_CATEGORY = "Staff salaries";

export function formatSalaryRemittanceMemo(
  fullName: string,
  periodYear: number,
  periodMonth: number,
): string {
  const period = `${periodYear}-${String(periodMonth).padStart(2, "0")}`;
  return `${fullName} — ${period}`;
}

export function formatSalaryPaymentChargeMemo(chargeLedgerTransactionId: string): string {
  return `charge:${chargeLedgerTransactionId}`;
}
