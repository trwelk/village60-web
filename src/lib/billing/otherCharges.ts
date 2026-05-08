import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingPayments,
  billingTransactions,
  homes,
  invoiceLineItems,
  invoices,
  residentAccounts,
  residents,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { getResident } from "@/lib/residents/service";
import { reversePostedBillingTransactionInTx } from "./ledgerReversal";

export const OTHER_CHARGE_TYPES = ["registration", "deposit"] as const;
export type OtherChargeType = (typeof OTHER_CHARGE_TYPES)[number];

export const RECORDED_OTHER_CHARGE_MESSAGE = "paidOn must be YYYY-MM-DD.";

export type ResidentOtherChargeListItem = {
  id: string;
  residentId: string;
  type: OtherChargeType;
  amountMinor: number;
  received: boolean;
  paidOn: string | null;
};

export type OtherChargeUpdatePatch = {
  amountMinor?: number;
  received?: boolean;
  paidOn?: string | null;
  hasPaidOnKey?: boolean;
};

function requireBillingAdmin(actor: SessionActor | undefined): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") throw new ForbiddenError();
}

function parseIsoDate(raw: string): string {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError(RECORDED_OTHER_CHARGE_MESSAGE);
  return s;
}

function accountForResident(db: AppDb, residentId: string) {
  const account = db.select().from(residentAccounts).where(eq(residentAccounts.residentId, residentId)).get();
  if (!account) throw new NotFoundError("Billing account not found.");
  return account;
}

function paymentForLineItem(db: AppDb, lineItemId: string) {
  return db
    .select({ payment: billingPayments, txn: billingTransactions })
    .from(billingPayments)
    .innerJoin(billingTransactions, eq(billingTransactions.id, billingPayments.ledgerTransactionId))
    .where(eq(billingTransactions.memo, `other-charge:${lineItemId}`))
    .get();
}

function listRowsForResident(db: AppDb, residentId: string): ResidentOtherChargeListItem[] {
  const account = accountForResident(db, residentId);
  return db
    .select({ li: invoiceLineItems })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
    .where(eq(invoices.accountId, account.id))
    .all()
    .filter((r) => r.li.category === "registration" || r.li.category === "deposit")
    .map((r) => {
      const linked = paymentForLineItem(db, r.li.id);
      return {
        id: r.li.id,
        residentId,
        type: r.li.category as OtherChargeType,
        amountMinor: r.li.amountMinor,
        received: Boolean(linked),
        paidOn: linked?.payment.receivedOn ?? null,
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type));
}

function upsertPaymentForLineItem(
  db: AppDb,
  actor: SessionActor,
  accountId: string,
  lineItemId: string,
  amountMinor: number,
  paidOn: string,
) {
  const linked = paymentForLineItem(db, lineItemId);
  if (!linked) {
    const now = Date.now();
    const paymentId = randomUUID();
    const txnId = randomUUID();
    db.insert(billingTransactions)
      .values({
        id: txnId,
        accountId,
        txnType: "payment",
        amountMinor: -amountMinor,
        sourceKind: "payment",
        sourceId: paymentId,
        memo: `other-charge:${lineItemId}`,
        recordedByUserId: actor.userId,
        postedAtUtcMs: Date.parse(`${paidOn}T00:00:00.000Z`),
      })
      .run();
    db.insert(billingPayments)
      .values({
        id: paymentId,
        accountId,
        amountMinor,
        receivedOn: paidOn,
        method: "manual",
        externalReference: null,
        notes: null,
        recordedByUserId: actor.userId,
        ledgerTransactionId: txnId,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    return;
  }
  if (linked.payment.amountMinor === amountMinor && linked.payment.receivedOn === paidOn) {
    return;
  }
  const now = Date.now();
  db.transaction((tx) => {
    reversePostedBillingTransactionInTx(
      tx,
      actor,
      {
        accountId,
        originalTransactionId: linked.txn.id,
        memo: `Correct other-charge payment for line ${lineItemId}`,
      },
      now,
    );
    tx.delete(billingPayments).where(eq(billingPayments.id, linked.payment.id)).run();

    const paymentId = randomUUID();
    const txnId = randomUUID();
    tx.insert(billingTransactions)
      .values({
        id: txnId,
        accountId,
        txnType: "payment",
        amountMinor: -amountMinor,
        sourceKind: "payment",
        sourceId: paymentId,
        memo: `other-charge:${lineItemId}`,
        recordedByUserId: actor.userId,
        postedAtUtcMs: Date.parse(`${paidOn}T00:00:00.000Z`),
      })
      .run();
    tx.insert(billingPayments)
      .values({
        id: paymentId,
        accountId,
        amountMinor,
        receivedOn: paidOn,
        method: "manual",
        externalReference: null,
        notes: null,
        recordedByUserId: actor.userId,
        ledgerTransactionId: txnId,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
  });
}

export function updateResidentOtherCharge(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  otherChargeId: string,
  patch: OtherChargeUpdatePatch,
): ResidentOtherChargeListItem {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  getResident(db, actor, homeId, residentId);
  const account = accountForResident(db, residentId);

  const row = db
    .select({ li: invoiceLineItems, inv: invoices })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
    .where(eq(invoiceLineItems.id, otherChargeId))
    .get();
  if (!row || row.inv.accountId !== account.id) throw new NotFoundError();
  if (row.li.category !== "registration" && row.li.category !== "deposit") {
    throw new ValidationError("Only registration/deposit line items are editable here.");
  }

  const nextAmount = patch.amountMinor ?? row.li.amountMinor;
  if (!Number.isInteger(nextAmount) || nextAmount < 0) {
    throw new ValidationError("amountMinor must be a non-negative integer.");
  }
  if (patch.amountMinor !== undefined && patch.amountMinor !== row.li.amountMinor) {
    db.update(invoiceLineItems)
      .set({ amountMinor: patch.amountMinor, updatedAtUtcMs: Date.now() })
      .where(eq(invoiceLineItems.id, row.li.id))
      .run();
  }

  const existing = paymentForLineItem(db, row.li.id);
  const receivedTarget =
    patch.received !== undefined ? patch.received : patch.hasPaidOnKey ? patch.paidOn !== null : Boolean(existing);

  if (!receivedTarget && existing) {
    const now = Date.now();
    db.transaction((tx) => {
      reversePostedBillingTransactionInTx(
        tx,
        actor,
        {
          accountId: account.id,
          originalTransactionId: existing.txn.id,
          memo: `Unrecord payment for other charge line ${row.li.id}`,
        },
        now,
      );
      tx.delete(billingPayments).where(eq(billingPayments.id, existing.payment.id)).run();
    });
  } else if (receivedTarget) {
    const paidOn = patch.hasPaidOnKey
      ? patch.paidOn === null
        ? new Date().toISOString().slice(0, 10)
        : parseIsoDate(patch.paidOn ?? new Date().toISOString().slice(0, 10))
      : existing?.payment.receivedOn ?? new Date().toISOString().slice(0, 10);
    upsertPaymentForLineItem(db, actor, account.id, row.li.id, nextAmount, paidOn);
  }

  const refreshed = listRowsForResident(db, residentId).find((x) => x.id === otherChargeId);
  if (!refreshed) throw new NotFoundError();
  return refreshed;
}

export function listResidentOtherCharges(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): ResidentOtherChargeListItem[] {
  getResident(db, actor, homeId, residentId);
  return listRowsForResident(db, residentId);
}

export const DEFAULT_INITIAL_OTHER_CHARGE_MINOR = 0;

export function initializeMissingResidentOtherCharges(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): {
  createdCount: number;
  createdTypes: OtherChargeType[];
  otherCharges: ResidentOtherChargeListItem[];
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  getResident(db, actor, homeId, residentId);
  const account = accountForResident(db, residentId);
  const existing = listRowsForResident(db, residentId);
  const existingTypes = new Set(existing.map((r) => r.type));
  const createdTypes: OtherChargeType[] = [];

  if (!existingTypes.has("registration") || !existingTypes.has("deposit")) {
    const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
    if (!home) throw new NotFoundError();
    const now = Date.now();
    const invoiceId = randomUUID();
    db.insert(invoices)
      .values({
        id: invoiceId,
        accountId: account.id,
        status: "draft",
        billingPeriod: null,
        issuedOn: null,
        totalMinorSnapshot: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    for (const type of OTHER_CHARGE_TYPES) {
      if (existingTypes.has(type)) continue;
      db.insert(invoiceLineItems)
        .values({
          id: randomUUID(),
          invoiceId,
          category: type,
          description: `${type} charge`,
          amountMinor: DEFAULT_INITIAL_OTHER_CHARGE_MINOR,
          serviceMonth: null,
          wardIdSnapshot: null,
          quantity: 1,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
      createdTypes.push(type);
    }
  }

  return {
    createdCount: createdTypes.length,
    createdTypes,
    otherCharges: listRowsForResident(db, residentId),
  };
}
