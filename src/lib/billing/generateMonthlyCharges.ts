import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  billingTransactions,
  homes,
  invoiceLineItems,
  invoices,
  residentAccounts,
  residents,
  wards,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { parseBillingMonth } from "./billingMonth";

export type MonthlyChargeSkipReason = "no_ward" | "no_rate" | "duplicate";

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
 * Creates draft invoices + monthly_fee lines from ward rate snapshots; ledger
 * charges post on finalize (see `finalizeInvoice` / cron finalization).
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
  const accountRows = db.select().from(residentAccounts).all();
  const accountByResidentId = new Map(accountRows.map((a) => [a.residentId, a]));

  const wardRows = db.select().from(wards).all();
  const wardById = new Map(wardRows.map((w) => [w.id, w]));

  const skipped: MonthlyChargeSkip[] = [];
  let created = 0;

  for (const r of active) {
    if (r.wardId == null) {
      skipped.push({
        residentId: r.id,
        homeId: r.homeId,
        reason: "no_ward",
      });
      continue;
    }

    const ward = wardById.get(r.wardId);
    if (!ward) {
      skipped.push({
        residentId: r.id,
        homeId: r.homeId,
        reason: "no_ward",
      });
      continue;
    }

    if (ward.monthlyRatePerPersonMinor == null) {
      skipped.push({
        residentId: r.id,
        homeId: r.homeId,
        reason: "no_rate",
      });
      continue;
    }

    let account = accountByResidentId.get(r.id);
    if (!account) {
      const home = homeById.get(r.homeId);
      if (!home) {
        skipped.push({
          residentId: r.id,
          homeId: r.homeId,
          reason: "no_rate",
        });
        continue;
      }
      const accountId = randomUUID();
      db.insert(residentAccounts)
        .values({
          id: accountId,
          residentId: r.id,
          currencyCode: home.defaultCurrencyCode,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
      account = {
        id: accountId,
        residentId: r.id,
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
      .where(
        and(
          eq(invoices.accountId, account.id),
          eq(invoices.billingPeriod, billingMonth),
          eq(invoices.status, "draft"),
        ),
      )
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
    db.insert(invoices)
      .values({
        id: invoiceId,
        accountId: account.id,
        status: "draft",
        billingPeriod: billingMonth,
        issuedOn: null,
        totalMinorSnapshot: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    db.insert(invoiceLineItems)
      .values({
        id: randomUUID(),
        invoiceId,
        category: "monthly_fee",
        description: `${billingMonth} monthly care fee`,
        amountMinor: ward.monthlyRatePerPersonMinor,
        serviceMonth: billingMonth,
        wardIdSnapshot: r.wardId,
        quantity: 1,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    created += 1;
  }

  return { billingMonth, created, skipped };
}
