import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingPayments,
  billingTransactions,
  invoices,
  accounts,
  residents,
  users,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

function requireBillingAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function assertActorUserExists(db: AppDb, actorUserId: string): void {
  const row = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, actorUserId))
    .get();
  if (!row) {
    throw new ForbiddenError("Session is no longer valid. Please sign in again.");
  }
}

function normalizeText(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const value = raw.trim();
  return value === "" ? null : value;
}

function invoiceHomeScopePredicate(homeId: string) {
  return or(
    and(eq(accounts.accountType, "resident"), eq(residents.homeId, homeId)),
    and(eq(accounts.accountType, "home"), eq(accounts.homeId, homeId)),
  );
}

function getInvoiceForHomeTx(tx: AppDb, homeId: string, invoiceId: string) {
  const row = tx
    .select({ invoice: invoices })
    .from(invoices)
    .innerJoin(accounts, eq(accounts.id, invoices.accountId))
    .leftJoin(residents, eq(residents.id, accounts.residentId))
    .where(and(eq(invoices.id, invoiceId), invoiceHomeScopePredicate(homeId)))
    .get();
  if (!row) {
    throw new NotFoundError();
  }
  return row.invoice;
}

function isSqliteUniqueConstraintError(e: unknown): boolean {
  if (!e || typeof e !== "object") {
    return false;
  }
  const err = e as { code?: string; message?: string };
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return true;
  }
  if (typeof err.message === "string" && err.message.includes("UNIQUE constraint failed")) {
    return true;
  }
  return false;
}

export function payInvoice(
  db: AppDb,
  actor: SessionActor | undefined,
  input: {
    homeId: string;
    invoiceId: string;
    paidOnUtcMs: number;
    method: string;
    externalReference?: string | null;
    notes?: string | null;
    postedAtUtcMs?: number;
  },
): { paymentId: string; ledgerTransactionId: string } {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);
  assertActorUserExists(db, actor.userId);

  if (
    !Number.isInteger(input.paidOnUtcMs) ||
    input.paidOnUtcMs <= 0 ||
    input.paidOnUtcMs > 4_101_913_167_000
  ) {
    throw new ValidationError("paidOnUtcMs must be a positive integer timestamp.");
  }
  if (!input.method.trim()) {
    throw new ValidationError("method is required.");
  }

  const postedAtUtcMs = input.postedAtUtcMs ?? Date.now();

  try {
    return db.transaction((tx) => {
      const invoice = getInvoiceForHomeTx(tx, input.homeId, input.invoiceId);

      if (invoice.status !== "finalized") {
        throw new ValidationError("Only finalized invoices can be marked paid.");
      }

      const totalMinorSnapshot = invoice.totalMinorSnapshot;
      if (totalMinorSnapshot == null || totalMinorSnapshot <= 0) {
        throw new ValidationError("Invoice has no payable total.");
      }

      const account = tx
        .select({ id: accounts.id, accountType: accounts.accountType })
        .from(accounts)
        .where(eq(accounts.id, invoice.accountId))
        .get();
      if (
        !account ||
        (account.accountType !== "resident" && account.accountType !== "home")
      ) {
        throw new NotFoundError("Billing account not found.");
      }

      const now = Date.now();
      const paymentId = randomUUID();
      const ledgerTransactionId = randomUUID();

      tx.insert(billingTransactions)
        .values({
          id: ledgerTransactionId,
          accountId: invoice.accountId,
          accountType: account.accountType,
          txnType: "payment",
          amountMinor: -totalMinorSnapshot,
          sourceKind: "invoice_payment",
          sourceId: invoice.id,
          memo: normalizeText(input.notes),
          recordedByUserId: actor.userId,
          postedAtUtcMs,
        })
        .run();

      tx.insert(billingPayments)
        .values({
          id: paymentId,
          accountId: invoice.accountId,
          amountMinor: totalMinorSnapshot,
          receivedOn: input.paidOnUtcMs,
          method: input.method.trim(),
          externalReference: normalizeText(input.externalReference),
          notes: normalizeText(input.notes),
          recordedByUserId: actor.userId,
          ledgerTransactionId,
          invoiceId: invoice.id,
          updatedAtUtcMs: now,
        })
        .run();

      tx.update(invoices)
        .set({
          status: "paid",
          updatedAtUtcMs: now,
        })
        .where(eq(invoices.id, invoice.id))
        .run();

      return { paymentId, ledgerTransactionId };
    });
  } catch (e) {
    if (isSqliteUniqueConstraintError(e)) {
      throw new ValidationError("Invoice is already paid.");
    }
    throw e;
  }
}

export function unpayInvoice(
  db: AppDb,
  actor: SessionActor | undefined,
  input: { homeId: string; invoiceId: string },
): { invoiceId: string } {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);

  return db.transaction((tx) => {
    const invoice = getInvoiceForHomeTx(tx, input.homeId, input.invoiceId);

    if (invoice.status !== "paid") {
      throw new ValidationError("Only paid invoices can be unmarked.");
    }

    const ledgerTxn = tx
      .select()
      .from(billingTransactions)
      .where(
        and(
          eq(billingTransactions.sourceKind, "invoice_payment"),
          eq(billingTransactions.sourceId, invoice.id),
        ),
      )
      .get();
    if (!ledgerTxn) {
      throw new NotFoundError("Invoice payment not found.");
    }

    const payment = tx
      .select()
      .from(billingPayments)
      .where(eq(billingPayments.ledgerTransactionId, ledgerTxn.id))
      .get();
    if (payment) {
      tx.delete(billingPayments).where(eq(billingPayments.id, payment.id)).run();
    }

    tx.delete(billingTransactions)
      .where(eq(billingTransactions.id, ledgerTxn.id))
      .run();

    const now = Date.now();
    tx.update(invoices)
      .set({
        status: "finalized",
        updatedAtUtcMs: now,
      })
      .where(eq(invoices.id, invoice.id))
      .run();

    return { invoiceId: invoice.id };
  });
}
