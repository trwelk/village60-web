import { and, asc, eq, inArray } from "drizzle-orm";
import { billingTransactions, invoices } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";

type SettleFinalizedInvoicesInput = {
  accountId: string;
  nowUtcMs: number;
};

type SettleFinalizedInvoicesResult = {
  markedPaidInvoiceIds: string[];
  remainingPaymentCapacityMinor: number;
};

/**
 * FIFO invoice settlement without explicit allocations.
 *
 * Uses payment credit from the ledger:
 *   - `payment` txns add capacity (negative amount lowers owed)
 *   - `adjustment` rows can increase/decrease capacity based on sign
 *
 * Then invoices are reconciled in FIFO order so statuses stay accurate after
 * retroactive corrections.
 */
export function settleFinalizedInvoicesFifo(
  tx: AppDb,
  input: SettleFinalizedInvoicesInput,
): SettleFinalizedInvoicesResult {
  const ledgerRows = tx
    .select({
      txnType: billingTransactions.txnType,
      amountMinor: billingTransactions.amountMinor,
    })
    .from(billingTransactions)
    .where(eq(billingTransactions.accountId, input.accountId))
    .all();

  let remainingPaymentCapacityMinor = 0;
  for (const row of ledgerRows) {
    if (row.txnType === "payment") {
      remainingPaymentCapacityMinor += -row.amountMinor;
      continue;
    }
    if (row.txnType === "adjustment") {
      remainingPaymentCapacityMinor += -row.amountMinor;
    }
  }
  if (remainingPaymentCapacityMinor <= 0) {
    remainingPaymentCapacityMinor = 0;
  }

  const candidateInvoices = tx
    .select({
      id: invoices.id,
      status: invoices.status,
      totalMinorSnapshot: invoices.totalMinorSnapshot,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.accountId, input.accountId),
        inArray(invoices.status, ["finalized", "paid"]),
      ),
    )
    .orderBy(asc(invoices.issuedOn), asc(invoices.createdAtUtcMs), asc(invoices.id))
    .all();

  const markedPaidInvoiceIds: string[] = [];
  for (const invoice of candidateInvoices) {
    const totalMinorSnapshot = invoice.totalMinorSnapshot ?? 0;
    const shouldBePaid =
      totalMinorSnapshot <= 0 || remainingPaymentCapacityMinor >= totalMinorSnapshot;
    if (shouldBePaid) {
      if (invoice.status !== "paid") {
        tx.update(invoices)
          .set({
            status: "paid",
            updatedAtUtcMs: input.nowUtcMs,
          })
          .where(eq(invoices.id, invoice.id))
          .run();
        markedPaidInvoiceIds.push(invoice.id);
      }
      if (totalMinorSnapshot > 0) {
        remainingPaymentCapacityMinor -= totalMinorSnapshot;
      }
      continue;
    }
    if (invoice.status === "paid") {
      tx.update(invoices)
        .set({
          status: "finalized",
          updatedAtUtcMs: input.nowUtcMs,
        })
        .where(eq(invoices.id, invoice.id))
        .run();
    }
  }

  return { markedPaidInvoiceIds, remainingPaymentCapacityMinor };
}
