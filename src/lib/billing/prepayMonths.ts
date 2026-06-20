import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  accounts,
  billingTransactions,
  homes,
  invoiceLineItems,
  invoices,
  residents,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { parseBillingMonth } from "@/lib/billing/billingMonth";
import { createDraftInvoice, finalizeInvoice } from "@/lib/billing/invoiceLifecycle";

function requireBillingAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function normalizeMonths(months: string[]): string[] {
  if (months.length === 0) {
    throw new ValidationError("At least one billing month is required.");
  }
  const parsed = months.map(parseBillingMonth);
  return [...new Set(parsed)].sort();
}

function monthAlreadyCharged(
  db: AppDb,
  accountId: string,
  billingMonth: string,
): boolean {
  const monthlyFeeSourceId = `${accountId}:${billingMonth}`;
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
  if (existingPosted) {
    return true;
  }

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
    .where(and(eq(invoices.accountId, accountId), eq(invoices.status, "draft")))
    .get();
  return existingDraft != null;
}

function resolveOrCreateResidentAccount(
  db: AppDb,
  residentId: string,
  homeId: string,
  nowUtcMs: number,
): string {
  const resident = db
    .select()
    .from(residents)
    .where(and(eq(residents.id, residentId), eq(residents.homeId, homeId)))
    .get();
  if (!resident) {
    throw new NotFoundError();
  }
  if (resident.status !== "active") {
    throw new ValidationError("Prepay is only available for active residents.");
  }

  const existing = db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.accountType, "resident"), eq(accounts.residentId, residentId)),
    )
    .get();
  if (existing) {
    return existing.id;
  }

  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }

  const accountId = randomUUID();
  db.insert(accounts)
    .values({
      id: accountId,
      accountType: "resident",
      residentId,
      homeId: null,
      currencyCode: home.defaultCurrencyCode,
      createdAtUtcMs: nowUtcMs,
      updatedAtUtcMs: nowUtcMs,
    })
    .run();
  return accountId;
}

/**
 * Creates one finalized invoice with a monthly_fee line per selected month.
 */
export function createPrepayInvoice(
  db: AppDb,
  actor: SessionActor | undefined,
  input: { homeId: string; residentId: string; months: string[] },
): { invoiceId: string; totalMinorSnapshot: number } {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);

  const months = normalizeMonths(input.months);
  const nowUtcMs = Date.now();
  const accountId = resolveOrCreateResidentAccount(
    db,
    input.residentId,
    input.homeId,
    nowUtcMs,
  );

  for (const billingMonth of months) {
    if (monthAlreadyCharged(db, accountId, billingMonth)) {
      throw new ValidationError(
        `Monthly fee for ${billingMonth} is already billed or pending for this resident.`,
      );
    }
  }

  const { invoiceId } = createDraftInvoice(db, actor, {
    homeId: input.homeId,
    accountId,
    lineItems: months.map((billingMonth) => ({
      category: "monthly_fee",
      description: `${billingMonth} monthly care fee`,
      amountMinor: 0,
      serviceMonth: billingMonth,
    })),
    nowUtcMs,
  });

  const finalized = finalizeInvoice(db, actor, {
    homeId: input.homeId,
    invoiceId,
    finalizedAtUtcMs: nowUtcMs,
  });

  return { invoiceId, totalMinorSnapshot: finalized.totalMinorSnapshot };
}
