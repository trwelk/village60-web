import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import {
  homePoNumberSeq,
  homePurchaseOrderReceiveEvents,
  inventoryBalances,
  inventoryTransactions,
  homePurchaseOrderLines,
  homePurchaseOrders,
  homes,
  inventoryItems,
  inventorySuppliers,
  residents,
  users,
} from "@/db/schema";
import { createPurchaseOrderCloseInvoices } from "@/lib/billing/poCloseInvoices";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

type PoStatus = "DRAFT" | "APPROVED" | "SENT" | "CLOSED";
type PoLineOwnerType = "HOME" | "RESIDENT";
type InventoryUnitClass = "countable" | "measurable";
type PoLineStatus = "OPEN" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELED";

function required(value: string, label: string): string {
  const v = value.trim();
  if (!v) throw new ValidationError(`${label} is required.`);
  return v;
}

function assertDraft(status: string): void {
  if (status !== "DRAFT") {
    throw new ValidationError("Only draft purchase orders can be edited.");
  }
}

function assertRoleForAction(
  actor: SessionActor,
  action: "PO_CREATE" | "PO_APPROVE" | "PO_DISAPPROVE" | "PO_SEND",
): void {
  // Current permissions model: approval/send are admin-only.
  if (action === "PO_CREATE") return;
  if (actor.role !== "admin") throw new ForbiddenError();
}

function isTerminalLineStatus(status: string): boolean {
  return status === "RECEIVED" || status === "CLOSED" || status === "CANCELED";
}

function maybeAutoClosePurchaseOrder(
  db: AppDb,
  purchaseOrderId: string,
  nowUtcMs: number,
): void {
  const lines = db
    .select({ status: homePurchaseOrderLines.status })
    .from(homePurchaseOrderLines)
    .where(eq(homePurchaseOrderLines.purchaseOrderId, purchaseOrderId))
    .all();
  if (lines.length === 0) return;
  if (!lines.every((l) => isTerminalLineStatus(l.status))) return;

  const po = db
    .select({ status: homePurchaseOrders.status })
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po || po.status === "CLOSED") return;

  db.update(homePurchaseOrders)
    .set({ status: "CLOSED", updatedAtUtcMs: nowUtcMs })
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .run();

  createPurchaseOrderCloseInvoices(db, purchaseOrderId, nowUtcMs);
}

function assertQuantityMatchesUnitClass(unitClass: InventoryUnitClass, quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ValidationError("Quantity must be greater than zero.");
  }
  if (unitClass === "countable" && !Number.isInteger(quantity)) {
    throw new ValidationError("countable items require integer quantity.");
  }
  if (unitClass === "measurable") {
    const scaled = Math.round(quantity * 1000);
    if (Math.abs(quantity * 1000 - scaled) > 1e-8) {
      throw new ValidationError("measurable items support up to 3 decimal places.");
    }
  }
}

/** Highest numeric PO suffix for the home (`PO-` + digits), or 0 if none / unparsable. */
function maxExistingPoNumericSuffix(db: AppDb, homeId: string): number {
  const row = db
    .select({ poNumber: homePurchaseOrders.poNumber })
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.homeId, homeId))
    .orderBy(desc(sql`CAST(SUBSTR(${homePurchaseOrders.poNumber}, 4) AS INTEGER)`))
    .limit(1)
    .get();
  if (!row?.poNumber) return 0;
  const match = /^PO-(\d+)$/.exec(row.poNumber);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/**
 * Per-home monotonic PO suffix (last assigned numeric part) in `home_po_number_seq`.
 * Bootstraps from existing `home_purchase_orders` once per home; then O(1).
 */
function bumpPoNumberSequence(db: AppDb, homeId: string, nowUtcMs: number): string {
  const hasRow = db
    .select({ homeId: homePoNumberSeq.homeId })
    .from(homePoNumberSeq)
    .where(eq(homePoNumberSeq.homeId, homeId))
    .get();
  if (!hasRow) {
    const lastUsed = maxExistingPoNumericSuffix(db, homeId);
    db.insert(homePoNumberSeq)
      .values({ homeId, lastSuffix: lastUsed, updatedAtUtcMs: nowUtcMs })
      .onConflictDoNothing()
      .run();
  }
  const bumped = db
    .update(homePoNumberSeq)
    .set({ lastSuffix: sql`${homePoNumberSeq.lastSuffix} + 1`, updatedAtUtcMs: nowUtcMs })
    .where(eq(homePoNumberSeq.homeId, homeId))
    .returning({ lastSuffix: homePoNumberSeq.lastSuffix })
    .get();
  if (!bumped) {
    throw new Error("PO number sequence update failed.");
  }
  return `PO-${String(bumped.lastSuffix).padStart(5, "0")}`;
}

export function createHomePurchaseOrder(
  db: AppDb,
  actor: SessionActor,
  input: { homeId: string; supplierId: string },
  nowUtcMs: number,
) {
  const homeId = required(input.homeId, "homeId");
  const supplierId = required(input.supplierId, "supplierId");
  assertRoleForAction(actor, "PO_CREATE");
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) throw new NotFoundError("Home not found.");
  assertActorMayAccessHome(db, actor, homeId);
  const supplier = db
    .select({ id: inventorySuppliers.id })
    .from(inventorySuppliers)
    .where(eq(inventorySuppliers.id, supplierId))
    .get();
  if (!supplier) throw new NotFoundError("Supplier not found.");

  return db.transaction((trx) => {
    const poNumber = bumpPoNumberSequence(trx, homeId, nowUtcMs);
    const po = {
      id: randomUUID(),
      homeId,
      poNumber,
      supplierId,
      status: "DRAFT" as PoStatus,
      approvedAtUtcMs: null,
      approvedByUserId: null,
      sentAtUtcMs: null,
      sentByUserId: null,
      createdByUserId: actor.userId,
      createdAtUtcMs: nowUtcMs,
      updatedAtUtcMs: nowUtcMs,
    };
    trx.insert(homePurchaseOrders).values(po).run();
    return po;
  });
}

export function listHomePurchaseOrders(db: AppDb, actor: SessionActor, homeId: string) {
  assertActorMayAccessHome(db, actor, homeId);
  return db
    .select({
      id: homePurchaseOrders.id,
      homeId: homePurchaseOrders.homeId,
      poNumber: homePurchaseOrders.poNumber,
      supplierId: homePurchaseOrders.supplierId,
      supplierName: inventorySuppliers.name,
      status: homePurchaseOrders.status,
      currencyCode: homePurchaseOrders.currencyCode,
      approvedAtUtcMs: homePurchaseOrders.approvedAtUtcMs,
      approvedByUserId: homePurchaseOrders.approvedByUserId,
      sentAtUtcMs: homePurchaseOrders.sentAtUtcMs,
      sentByUserId: homePurchaseOrders.sentByUserId,
      createdByUserId: homePurchaseOrders.createdByUserId,
      createdByDisplayName: users.displayName,
      createdByEmail: users.email,
      createdAtUtcMs: homePurchaseOrders.createdAtUtcMs,
      updatedAtUtcMs: homePurchaseOrders.updatedAtUtcMs,
      totalReceivedCents: sql<number>`COALESCE(SUM(${homePurchaseOrderReceiveEvents.unitPriceCents} * ${homePurchaseOrderReceiveEvents.qtyReceivedEvent}), 0)`,
    })
    .from(homePurchaseOrders)
    .innerJoin(inventorySuppliers, eq(inventorySuppliers.id, homePurchaseOrders.supplierId))
    .leftJoin(users, eq(users.id, homePurchaseOrders.createdByUserId))
    .leftJoin(
      homePurchaseOrderReceiveEvents,
      eq(homePurchaseOrderReceiveEvents.purchaseOrderId, homePurchaseOrders.id),
    )
    .where(eq(homePurchaseOrders.homeId, homeId))
    .groupBy(homePurchaseOrders.id)
    .orderBy(desc(homePurchaseOrders.createdAtUtcMs), desc(homePurchaseOrders.id))
    .all();
}

export function getPurchaseOrderSummary(
  db: AppDb,
  actor: SessionActor,
  purchaseOrderId: string,
) {
  const po = db
    .select({
      id: homePurchaseOrders.id,
      homeId: homePurchaseOrders.homeId,
      poNumber: homePurchaseOrders.poNumber,
      status: homePurchaseOrders.status,
    })
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  return po;
}

function validateLineOwner(
  db: AppDb,
  poHomeId: string,
  ownerType: PoLineOwnerType,
  ownerId: string,
): void {
  if (ownerType === "HOME") {
    if (ownerId !== poHomeId) {
      throw new ValidationError("HOME ownerId must match purchase order home.");
    }
    return;
  }
  const resident = db
    .select({ id: residents.id, homeId: residents.homeId })
    .from(residents)
    .where(eq(residents.id, ownerId))
    .get();
  if (!resident) throw new NotFoundError("Owner resident not found.");
  if (resident.homeId !== poHomeId) {
    throw new ValidationError("Resident owner must belong to purchase order home.");
  }
}

export function addPurchaseOrderLine(
  db: AppDb,
  actor: SessionActor,
  input: {
    purchaseOrderId: string;
    itemId: string;
    ownerType: PoLineOwnerType;
    ownerId: string;
    purchaseUnitType: string;
    quantityOrderedBaseUnits: number;
  },
  nowUtcMs: number,
) {
  const purchaseOrderId = required(input.purchaseOrderId, "purchaseOrderId");
  const itemId = required(input.itemId, "itemId");
  const ownerId = required(input.ownerId, "ownerId");
  const purchaseUnitType = required(input.purchaseUnitType, "purchaseUnitType");
  if (purchaseUnitType.length > 80) {
    throw new ValidationError("purchaseUnitType must be at most 80 characters.");
  }
  const po = db
    .select({
      id: homePurchaseOrders.id,
      homeId: homePurchaseOrders.homeId,
      poNumber: homePurchaseOrders.poNumber,
      supplierId: homePurchaseOrders.supplierId,
      supplierName: inventorySuppliers.name,
      status: homePurchaseOrders.status,
      approvedAtUtcMs: homePurchaseOrders.approvedAtUtcMs,
      approvedByUserId: homePurchaseOrders.approvedByUserId,
      sentAtUtcMs: homePurchaseOrders.sentAtUtcMs,
      sentByUserId: homePurchaseOrders.sentByUserId,
      createdByUserId: homePurchaseOrders.createdByUserId,
      createdAtUtcMs: homePurchaseOrders.createdAtUtcMs,
      updatedAtUtcMs: homePurchaseOrders.updatedAtUtcMs,
    })
    .from(homePurchaseOrders)
    .innerJoin(inventorySuppliers, eq(inventorySuppliers.id, homePurchaseOrders.supplierId))
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  assertDraft(po.status);
  const item = db
    .select({ id: inventoryItems.id, homeId: inventoryItems.homeId })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId))
    .get();
  if (!item) throw new NotFoundError("Inventory item not found.");
  if (item.homeId !== po.homeId) {
    throw new ValidationError("Item home must match purchase order home.");
  }
  if (input.ownerType !== "HOME" && input.ownerType !== "RESIDENT") {
    throw new ValidationError("ownerType must be HOME or RESIDENT.");
  }
  validateLineOwner(db, po.homeId, input.ownerType, ownerId);
  if (!Number.isFinite(input.quantityOrderedBaseUnits) || input.quantityOrderedBaseUnits <= 0) {
    throw new ValidationError("quantityOrderedBaseUnits must be greater than zero.");
  }
  const line = {
    id: randomUUID(),
    purchaseOrderId,
    itemId,
    ownerType: input.ownerType,
    ownerId,
    purchaseUnitType,
    quantityOrderedBaseUnits: input.quantityOrderedBaseUnits,
    quantityReceivedBaseUnits: 0,
    status: "OPEN",
    createdAtUtcMs: nowUtcMs,
    updatedAtUtcMs: nowUtcMs,
  } as const;
  db.insert(homePurchaseOrderLines).values(line).run();
  return line;
}

export function approvePurchaseOrder(
  db: AppDb,
  actor: SessionActor,
  purchaseOrderId: string,
  nowUtcMs: number,
) {
  const po = db
    .select()
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  assertRoleForAction(actor, "PO_APPROVE");
  if (po.status !== "DRAFT") {
    throw new ValidationError("Only draft purchase orders can be approved.");
  }
  db.update(homePurchaseOrders)
    .set({
      status: "APPROVED",
      approvedAtUtcMs: nowUtcMs,
      approvedByUserId: actor.userId,
      updatedAtUtcMs: nowUtcMs,
    })
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .run();
}

export function sendPurchaseOrder(
  db: AppDb,
  actor: SessionActor,
  purchaseOrderId: string,
  nowUtcMs: number,
) {
  const po = db
    .select()
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  assertRoleForAction(actor, "PO_SEND");
  if (po.status !== "APPROVED") {
    throw new ValidationError("Only approved purchase orders can be sent.");
  }
  db.update(homePurchaseOrders)
    .set({
      status: "SENT",
      sentAtUtcMs: nowUtcMs,
      sentByUserId: actor.userId,
      updatedAtUtcMs: nowUtcMs,
    })
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .run();
}

export function disapprovePurchaseOrder(
  db: AppDb,
  actor: SessionActor,
  purchaseOrderId: string,
  nowUtcMs: number,
) {
  const po = db
    .select()
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  assertRoleForAction(actor, "PO_DISAPPROVE");
  if (po.status !== "APPROVED") {
    throw new ValidationError("Only approved purchase orders can be disapproved.");
  }
  db.update(homePurchaseOrders)
    .set({
      status: "DRAFT",
      approvedAtUtcMs: null,
      approvedByUserId: null,
      updatedAtUtcMs: nowUtcMs,
    })
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .run();
}

export function getPurchaseOrderWithLines(
  db: AppDb,
  actor: SessionActor,
  purchaseOrderId: string,
) {
  const po = db
    .select()
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  const rawLines = db
    .select({
      id: homePurchaseOrderLines.id,
      itemId: homePurchaseOrderLines.itemId,
      ownerType: homePurchaseOrderLines.ownerType,
      ownerId: homePurchaseOrderLines.ownerId,
      purchaseUnitType: homePurchaseOrderLines.purchaseUnitType,
      quantityOrderedBaseUnits: homePurchaseOrderLines.quantityOrderedBaseUnits,
      quantityReceivedBaseUnits: homePurchaseOrderLines.quantityReceivedBaseUnits,
      status: homePurchaseOrderLines.status,
      itemName: inventoryItems.name,
      itemBaseUnit: inventoryItems.baseUnit,
    })
    .from(homePurchaseOrderLines)
    .innerJoin(inventoryItems, eq(inventoryItems.id, homePurchaseOrderLines.itemId))
    .where(eq(homePurchaseOrderLines.purchaseOrderId, purchaseOrderId))
    .orderBy(asc(homePurchaseOrderLines.createdAtUtcMs), asc(homePurchaseOrderLines.id))
    .all();
  const homeOwnerName =
    db.select({ name: homes.name }).from(homes).where(eq(homes.id, po.homeId)).get()?.name ??
    po.homeId;
  const residentOwnerIds = rawLines
    .filter((line) => line.ownerType === "RESIDENT")
    .map((line) => line.ownerId);
  const residentNameById = new Map<string, string>();
  if (residentOwnerIds.length > 0) {
    const residentRows = db
      .select({
        id: residents.id,
        fullName: residents.fullName,
      })
      .from(residents)
      .where(eq(residents.homeId, po.homeId))
      .all();
    for (const resident of residentRows) {
      residentNameById.set(resident.id, resident.fullName || resident.id);
    }
  }
  const receiveEventCosts = db
    .select({
      purchaseOrderLineId: homePurchaseOrderReceiveEvents.purchaseOrderLineId,
      totalReceivedCents: sql<number>`COALESCE(SUM(${homePurchaseOrderReceiveEvents.unitPriceCents} * ${homePurchaseOrderReceiveEvents.qtyReceivedEvent}), 0)`,
    })
    .from(homePurchaseOrderReceiveEvents)
    .where(eq(homePurchaseOrderReceiveEvents.purchaseOrderId, purchaseOrderId))
    .groupBy(homePurchaseOrderReceiveEvents.purchaseOrderLineId)
    .all();
  const costByLineId = new Map(
    receiveEventCosts.map((r) => [r.purchaseOrderLineId, r.totalReceivedCents]),
  );
  const lines = rawLines.map((line) => ({
    ...line,
    purchaseUnitTypeDisplay:
      line.purchaseUnitType.trim().length > 0
        ? line.purchaseUnitType.trim()
        : line.itemBaseUnit,
    ownerDisplayName:
      line.ownerType === "HOME"
        ? homeOwnerName
        : (residentNameById.get(line.ownerId) ?? line.ownerId),
    totalReceivedCents: costByLineId.get(line.id) ?? 0,
  }));
  const totalReceivedCents = receiveEventCosts.reduce((sum, r) => sum + r.totalReceivedCents, 0);
  return { po, lines, totalReceivedCents };
}

export function receivePurchaseOrderLine(
  db: AppDb,
  actor: SessionActor,
  input: {
    purchaseOrderId: string;
    purchaseOrderLineId: string;
    qtyReceivedEvent: number;
    baseUnitsReceivedEvent: number;
    unitPriceCents: number;
    currencyCode: string;
    receivedAtUtcMs: number;
    note?: string | null;
  },
  nowUtcMs: number,
) {
  const purchaseOrderId = required(input.purchaseOrderId, "purchaseOrderId");
  const purchaseOrderLineId = required(input.purchaseOrderLineId, "purchaseOrderLineId");
  const currencyCode = required(input.currencyCode, "currencyCode");
  const po = db
    .select()
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  if (po.status !== "SENT") {
    throw new ValidationError("Receiving is only allowed for sent purchase orders.");
  }
  const line = db
    .select()
    .from(homePurchaseOrderLines)
    .where(
      and(
        eq(homePurchaseOrderLines.id, purchaseOrderLineId),
        eq(homePurchaseOrderLines.purchaseOrderId, purchaseOrderId),
      ),
    )
    .get();
  if (!line) throw new NotFoundError("Purchase order line not found.");
  if (line.status === "CLOSED" || line.status === "CANCELED") {
    throw new ValidationError("Receiving is blocked for closed or canceled lines.");
  }
  const item = db
    .select({
      unitClass: inventoryItems.unitClass,
      homeId: inventoryItems.homeId,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, line.itemId))
    .get();
  if (!item) throw new NotFoundError("Inventory item not found.");
  if (item.homeId !== po.homeId) {
    throw new ValidationError("Item home must match purchase order home.");
  }
  if (item.unitClass !== "countable" && item.unitClass !== "measurable") {
    throw new ValidationError("Inventory item unit class is invalid.");
  }
  const qtyReceivedEvent = Number(input.qtyReceivedEvent);
  const baseUnitsReceivedEvent = Number(input.baseUnitsReceivedEvent);
  const unitPriceCents = Math.round(Number(input.unitPriceCents));
  const receivedAtUtcMs = Number(input.receivedAtUtcMs);
  assertQuantityMatchesUnitClass(item.unitClass, qtyReceivedEvent);
  assertQuantityMatchesUnitClass(item.unitClass, baseUnitsReceivedEvent);
  if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0) {
    throw new ValidationError("unitPriceCents must be a positive integer (price in minor currency units).");
  }
  if (!Number.isFinite(receivedAtUtcMs) || receivedAtUtcMs <= 0) {
    throw new ValidationError("receivedAtUtcMs is required.");
  }
  if (po.currencyCode && po.currencyCode !== currencyCode) {
    throw new ValidationError("All receive events on a purchase order must use one currency.");
  }
  const note = input.note == null ? null : input.note.trim() || null;
  const txId = randomUUID();
  const eventId = randomUUID();
  const balance = db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.ownerType, line.ownerType),
        eq(inventoryBalances.ownerId, line.ownerId),
        eq(inventoryBalances.itemId, line.itemId),
      ),
    )
    .get();
  const resultingBalance = (balance?.quantityBaseUnits ?? 0) + baseUnitsReceivedEvent;
  const receivedRollup = line.quantityReceivedBaseUnits + baseUnitsReceivedEvent;
  const nextLineStatus: PoLineStatus =
    receivedRollup >= line.quantityOrderedBaseUnits
      ? "RECEIVED"
      : receivedRollup > 0
        ? "PARTIALLY_RECEIVED"
        : "OPEN";

  db.transaction((trx) => {
    trx.insert(homePurchaseOrderReceiveEvents)
      .values({
        id: eventId,
        purchaseOrderId,
        purchaseOrderLineId,
        qtyReceivedEvent,
        baseUnitsReceivedEvent,
        unitPriceCents,
        currencyCode,
        receivedAtUtcMs,
        note,
        createdByUserId: actor.userId,
        createdAtUtcMs: nowUtcMs,
      })
      .run();

    trx.insert(inventoryTransactions)
      .values({
        id: txId,
        ownerType: line.ownerType,
        ownerId: line.ownerId,
        itemId: line.itemId,
        transactionType: "RECEIVE",
        quantityDeltaBaseUnits: baseUnitsReceivedEvent,
        sourceType: "PO_RECEIVE_EVENT",
        sourceId: eventId,
        note,
        actorUserId: actor.userId,
        createdAtUtcMs: nowUtcMs,
      })
      .run();

    if (!balance) {
      trx.insert(inventoryBalances)
        .values({
          id: randomUUID(),
          ownerType: line.ownerType,
          ownerId: line.ownerId,
          itemId: line.itemId,
          quantityBaseUnits: resultingBalance,
          createdAtUtcMs: nowUtcMs,
          updatedAtUtcMs: nowUtcMs,
        })
        .run();
    } else {
      trx.update(inventoryBalances)
        .set({
          quantityBaseUnits: resultingBalance,
          updatedAtUtcMs: nowUtcMs,
        })
        .where(eq(inventoryBalances.id, balance.id))
        .run();
    }

    trx.update(homePurchaseOrderLines)
      .set({
        quantityReceivedBaseUnits: receivedRollup,
        status: nextLineStatus,
        updatedAtUtcMs: nowUtcMs,
      })
      .where(eq(homePurchaseOrderLines.id, line.id))
      .run();

    if (!po.currencyCode) {
      trx.update(homePurchaseOrders)
        .set({ currencyCode, updatedAtUtcMs: nowUtcMs })
        .where(eq(homePurchaseOrders.id, purchaseOrderId))
        .run();
    }

    maybeAutoClosePurchaseOrder(trx as unknown as AppDb, purchaseOrderId, nowUtcMs);
  });

  return {
    receiveEventId: eventId,
    purchaseOrderId,
    purchaseOrderLineId,
    baseUnitsReceivedEvent,
    qtyReceivedEvent,
    unitPriceCents,
    currencyCode,
    lineQuantityReceivedBaseUnits: receivedRollup,
    lineStatus: nextLineStatus,
  };
}

export function closePurchaseOrderLine(
  db: AppDb,
  actor: SessionActor,
  input: { purchaseOrderId: string; purchaseOrderLineId: string },
  nowUtcMs: number,
) {
  const po = db
    .select()
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, input.purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  if (po.status !== "SENT") {
    throw new ValidationError("Line close is only allowed after purchase order is sent.");
  }
  const line = db
    .select()
    .from(homePurchaseOrderLines)
    .where(
      and(
        eq(homePurchaseOrderLines.id, input.purchaseOrderLineId),
        eq(homePurchaseOrderLines.purchaseOrderId, input.purchaseOrderId),
      ),
    )
    .get();
  if (!line) throw new NotFoundError("Purchase order line not found.");
  if (line.status === "CANCELED") {
    throw new ValidationError("Canceled lines cannot be closed.");
  }
  if (line.status === "CLOSED") {
    return { lineStatus: "CLOSED" as const };
  }
  db.update(homePurchaseOrderLines)
    .set({ status: "CLOSED", updatedAtUtcMs: nowUtcMs })
    .where(eq(homePurchaseOrderLines.id, line.id))
    .run();
  maybeAutoClosePurchaseOrder(db, input.purchaseOrderId, nowUtcMs);
  return { lineStatus: "CLOSED" as const };
}

export function cancelPurchaseOrderLineRemaining(
  db: AppDb,
  actor: SessionActor,
  input: { purchaseOrderId: string; purchaseOrderLineId: string },
  nowUtcMs: number,
) {
  const po = db
    .select()
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, input.purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  if (po.status !== "SENT") {
    throw new ValidationError("Line cancel is only allowed after purchase order is sent.");
  }
  const line = db
    .select()
    .from(homePurchaseOrderLines)
    .where(
      and(
        eq(homePurchaseOrderLines.id, input.purchaseOrderLineId),
        eq(homePurchaseOrderLines.purchaseOrderId, input.purchaseOrderId),
      ),
    )
    .get();
  if (!line) throw new NotFoundError("Purchase order line not found.");
  if (line.status === "CLOSED") {
    throw new ValidationError("Closed lines cannot be canceled.");
  }
  if (line.status === "CANCELED") {
    return { lineStatus: "CANCELED" as const, canceledRemainingBaseUnits: 0 };
  }
  const remaining = Math.max(0, line.quantityOrderedBaseUnits - line.quantityReceivedBaseUnits);
  if (remaining <= 0) {
    throw new ValidationError("Only unreceived quantity can be canceled.");
  }
  db.update(homePurchaseOrderLines)
    .set({ status: "CANCELED", updatedAtUtcMs: nowUtcMs })
    .where(eq(homePurchaseOrderLines.id, line.id))
    .run();
  maybeAutoClosePurchaseOrder(db, input.purchaseOrderId, nowUtcMs);
  return { lineStatus: "CANCELED" as const, canceledRemainingBaseUnits: remaining };
}

export function searchHomeInventoryItems(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  query: string,
) {
  assertActorMayAccessHome(db, actor, homeId);
  const q = query.trim();
  const where = q
    ? and(eq(inventoryItems.homeId, homeId), like(inventoryItems.name, `%${q}%`))
    : eq(inventoryItems.homeId, homeId);
  return db
    .select({ id: inventoryItems.id, name: inventoryItems.name, baseUnit: inventoryItems.baseUnit })
    .from(inventoryItems)
    .where(where)
    .orderBy(asc(inventoryItems.name), asc(inventoryItems.id))
    .limit(30)
    .all();
}

export function deletePurchaseOrder(db: AppDb, actor: SessionActor, purchaseOrderId: string) {
  const po = db
    .select()
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po) throw new NotFoundError("Purchase order not found.");
  assertActorMayAccessHome(db, actor, po.homeId);
  if (po.status !== "DRAFT") {
    throw new ValidationError("Purchase order cannot be deleted after approval.");
  }
  const lineStats = db
    .select({ received: sql<number>`sum(${homePurchaseOrderLines.quantityReceivedBaseUnits})` })
    .from(homePurchaseOrderLines)
    .where(eq(homePurchaseOrderLines.purchaseOrderId, purchaseOrderId))
    .get();
  if ((lineStats?.received ?? 0) > 0) {
    throw new ValidationError("Purchase order cannot be deleted after any receipt.");
  }
  db.delete(homePurchaseOrders).where(eq(homePurchaseOrders.id, purchaseOrderId)).run();
}
