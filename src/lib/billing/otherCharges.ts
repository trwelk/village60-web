import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  homes,
  invoiceLineItems,
  invoices,
  accounts,
  residents,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { getResident } from "@/lib/residents/service";
import { bumpInvNumberSequence } from "@/lib/billing/invoiceNumbers";
import { utcDateOnlyFromMs } from "@/lib/billing/billingMonth";
import type { CreateResidentOtherChargesIntake } from "@/lib/billing/otherChargeIntake";

export const OTHER_CHARGE_TYPES = ["registration", "deposit"] as const;
export type OtherChargeType = (typeof OTHER_CHARGE_TYPES)[number];

export type ResidentOtherChargeListItem = {
  id: string;
  residentId: string;
  type: OtherChargeType;
  amountMinor: number;
};

export type OtherChargeUpdatePatch = {
  amountMinor?: number;
};

function requireBillingAdmin(actor: SessionActor | undefined): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") throw new ForbiddenError();
}

function accountForResident(db: AppDb, residentId: string) {
  const account = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.accountType, "resident"), eq(accounts.residentId, residentId)))
    .get();
  if (!account) throw new NotFoundError("Billing account not found.");
  return account;
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
      return {
        id: r.li.id,
        residentId,
        type: r.li.category as OtherChargeType,
        amountMinor: r.li.amountMinor,
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type));
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

/**
 * Creates one draft invoice with registration + deposit line items from the create-resident
 * wizard (17c). When a line is marked received, records the payment in the same transaction.
 */
export function applyCreateResidentOtherChargesIntake(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  accountId: string,
  intake: CreateResidentOtherChargesIntake,
  nowUtcMs: number,
): void {
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) throw new NotFoundError();

  const invoiceId = randomUUID();
  const invNo = bumpInvNumberSequence(db, homeId, nowUtcMs);
  db.insert(invoices)
    .values({
      id: invoiceId,
      accountId,
      homeId,
      invNo,
      purchaseOrderId: null,
      status: "draft",
      issuedOn: utcDateOnlyFromMs(nowUtcMs),
      totalMinorSnapshot: null,
      createdAtUtcMs: nowUtcMs,
      updatedAtUtcMs: nowUtcMs,
    })
    .run();

  for (const type of OTHER_CHARGE_TYPES) {
    const line = intake[type];
    const lineItemId = randomUUID();
    db.insert(invoiceLineItems)
      .values({
        id: lineItemId,
        invoiceId,
        category: type,
        description: `${type} charge`,
        amountMinor: line.amountMinor,
        serviceMonth: null,
        quantity: 1,
        createdAtUtcMs: nowUtcMs,
        updatedAtUtcMs: nowUtcMs,
      })
      .run();
  }
}

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
    db.transaction((tx) => {
      const invNo = bumpInvNumberSequence(tx, homeId, now);
      tx.insert(invoices)
        .values({
          id: invoiceId,
          accountId: account.id,
          homeId,
          invNo,
          purchaseOrderId: null,
          status: "draft",
          issuedOn: utcDateOnlyFromMs(now),
          totalMinorSnapshot: null,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
      for (const type of OTHER_CHARGE_TYPES) {
        if (existingTypes.has(type)) continue;
        tx.insert(invoiceLineItems)
          .values({
            id: randomUUID(),
            invoiceId,
            category: type,
            description: `${type} charge`,
            amountMinor: DEFAULT_INITIAL_OTHER_CHARGE_MINOR,
            serviceMonth: null,
            quantity: 1,
            createdAtUtcMs: now,
            updatedAtUtcMs: now,
          })
          .run();
        createdTypes.push(type);
      }
    });
  }

  return {
    createdCount: createdTypes.length,
    createdTypes,
    otherCharges: listRowsForResident(db, residentId),
  };
}
