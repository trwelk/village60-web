import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  billingTransactions,
  homes,
  invoiceLineItems,
  invoices,
  accounts,
  residents,
  wards,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { bumpInvNumberSequence } from "./invoiceNumbers";
import { parseBillingMonth } from "./billingMonth";

export type MonthlyChargeSkipReason = "duplicate";

export type MonthlyChargeSkip = {
  residentId: string;
  homeId: string;
  reason: MonthlyChargeSkipReason;
};

export type GenerateMonthlyChargesResult = {
  billingMonth: string;
  created: number;
  skipped: MonthlyChargeSkip[];
};

/**
 * Idempotent monthly draft invoices for one UTC `billing_month` (YYYY-MM).
 * Creates draft invoices for every active resident and adds `monthly_fee`
 * lines when a ward rate exists; ledger charges post on finalize.
 */
export function generateMonthlyCharges(
  db: AppDb,
  input: { billingMonth: string },
): GenerateMonthlyChargesResult {
  const billingMonth = parseBillingMonth(input.billingMonth);
  const now = Date.now();

  const active = db
    .select()
    .from(residents)
    .where(eq(residents.status, "active"))
    .all();
  const homeRows = db.select().from(homes).all();
  const homeById = new Map(homeRows.map((h) => [h.id, h]));
  const accountRows = db
    .select()
    .from(accounts)
    .where(eq(accounts.accountType, "resident"))
    .all();
  const accountByResidentId = new Map(accountRows.map((a) => [a.residentId, a]));

  const wardRows = db.select().from(wards).all();
  const wardById = new Map(wardRows.map((w) => [w.id, w]));

  const skipped: MonthlyChargeSkip[] = [];
  let created = 0;

  for (const r of active) {
    let account = accountByResidentId.get(r.id);
    if (!account) {
      const home = homeById.get(r.homeId);
      if (!home) {
        continue;
      }
      const accountId = randomUUID();
      db.insert(accounts)
        .values({
          id: accountId,
          accountType: "resident",
          residentId: r.id,
          homeId: null,
          currencyCode: home.defaultCurrencyCode,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
      account = {
        id: accountId,
        accountType: "resident",
        residentId: r.id,
        homeId: null,
        currencyCode: home.defaultCurrencyCode,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      };
      accountByResidentId.set(r.id, account);
    }

    const monthlyFeeSourceId = `${account.id}:${billingMonth}`;
    const existingPosted = db
      .select({ id: billingTransactions.id })
      .from(billingTransactions)
      .where(
        and(
          eq(billingTransactions.sourceKind, "invoice_monthly_fee"),
          eq(billingTransactions.sourceId, monthlyFeeSourceId),
        ),
      )
      .get();

    const existingDraft = db
      .select({ id: invoices.id })
      .from(invoices)
      .innerJoin(
        invoiceLineItems,
        and(
          eq(invoiceLineItems.invoiceId, invoices.id),
          eq(invoiceLineItems.category, "monthly_fee"),
          eq(invoiceLineItems.serviceMonth, billingMonth),
        ),
      )
      .where(and(eq(invoices.accountId, account.id), eq(invoices.status, "draft")))
      .get();

    if (existingPosted || existingDraft) {
      skipped.push({
        residentId: r.id,
        homeId: r.homeId,
        reason: "duplicate",
      });
      continue;
    }

    const invoiceId = randomUUID();
    db.transaction((tx) => {
      const invNo = bumpInvNumberSequence(tx, r.homeId, now);
      tx.insert(invoices)
        .values({
          id: invoiceId,
          accountId: account.id,
          homeId: r.homeId,
          invNo,
          purchaseOrderId: null,
          status: "draft",
          issuedOn: `${billingMonth}-01`,
          totalMinorSnapshot: null,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
      const ward = r.wardId == null ? undefined : wardById.get(r.wardId);
      if (ward?.monthlyRatePerPersonMinor != null) {
        tx.insert(invoiceLineItems)
          .values({
            id: randomUUID(),
            invoiceId,
            category: "monthly_fee",
            description: `${billingMonth} monthly care fee`,
            amountMinor: ward.monthlyRatePerPersonMinor,
            serviceMonth: billingMonth,
            quantity: 1,
            createdAtUtcMs: now,
            updatedAtUtcMs: now,
          })
          .run();
      }
    });
    created += 1;
  }

  return { billingMonth, created, skipped };
}

