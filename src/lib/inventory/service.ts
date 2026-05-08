import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  homes,
  inventoryBalances,
  inventoryItems,
  inventoryTransactions,
  residents,
} from "@/db/schema";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

export type InventoryOwnerType = "HOME" | "RESIDENT";
export type InventoryUnitClass = "countable" | "measurable";
export type InventoryAdjustmentReasonCode =
  | "DAMAGED"
  | "EXPIRED"
  | "COUNT_CORRECTION"
  | "OTHER";

export type RecordInventoryTransactionInput = {
  ownerType: InventoryOwnerType;
  ownerId: string;
  itemId: string;
  transactionType: string;
  transferId?: string | null;
  quantityDeltaBaseUnits: number;
  sourceType: string;
  sourceId: string;
  note?: string | null;
};

export type RecordInventoryTransactionResult = {
  transactionId: string;
  ownerType: InventoryOwnerType;
  ownerId: string;
  itemId: string;
  transferId: string | null;
  quantityDeltaBaseUnits: number;
  resultingBalanceBaseUnits: number;
  sourceType: string;
  sourceId: string;
  note: string | null;
  createdAtUtcMs: number;
};

export type DispenseInventoryInput = {
  ownerType: InventoryOwnerType;
  ownerId: string;
  itemId: string;
  quantityBaseUnits: number;
  sourceType: string;
  sourceId: string;
  note?: string | null;
};

export type AdjustInventoryInput = {
  ownerType: InventoryOwnerType;
  ownerId: string;
  itemId: string;
  adjustmentType: "ADJUST_IN" | "ADJUST_OUT";
  quantityBaseUnits: number;
  reasonCode: InventoryAdjustmentReasonCode;
  note?: string | null;
  sourceType: string;
  sourceId: string;
};

export type TransferInventoryToResidentInput = {
  homeId: string;
  residentId: string;
  itemId: string;
  quantityBaseUnits: number;
  sourceType: string;
  sourceId: string;
  note?: string | null;
};

export type TransferInventoryToResidentResult = {
  transferId: string;
  itemId: string;
  homeId: string;
  residentId: string;
  quantityBaseUnits: number;
  homeResultingBalanceBaseUnits: number;
  residentResultingBalanceBaseUnits: number;
  createdAtUtcMs: number;
};

function normalizeRequiredString(value: string, label: string): string {
  const v = value.trim();
  if (!v) {
    throw new ValidationError(`${label} is required.`);
  }
  return v;
}

function assertQuantityMatchesUnitClass(
  unitClass: InventoryUnitClass,
  quantity: number,
): void {
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new ValidationError("quantityDeltaBaseUnits must be a non-zero number.");
  }
  if (unitClass === "countable" && !Number.isInteger(quantity)) {
    throw new ValidationError(
      "countable items require integer quantityDeltaBaseUnits.",
    );
  }
  if (unitClass === "measurable") {
    const scaled = Math.round(quantity * 1000);
    if (Math.abs(quantity * 1000 - scaled) > 1e-8) {
      throw new ValidationError(
        "measurable items support up to 3 decimal places.",
      );
    }
  }
}

function assertActorMayPerformInventoryAction(
  actor: SessionActor,
  action: "INVENTORY_DISPENSE" | "INVENTORY_ADJUST",
): void {
  if (actor.role === "admin") {
    return;
  }
  if (action === "INVENTORY_DISPENSE" && actor.role === "care") {
    return;
  }
  throw new ForbiddenError(`${action} permission required.`);
}

function resolveOwnerHomeId(
  db: AppDb,
  actor: SessionActor,
  ownerType: InventoryOwnerType,
  ownerId: string,
): string {
  if (ownerType === "HOME") {
    const home = db.select().from(homes).where(eq(homes.id, ownerId)).get();
    if (!home) throw new NotFoundError("Owner home not found.");
    assertActorMayAccessHome(db, actor, home.id);
    return home.id;
  }
  const resident = db
    .select({ id: residents.id, homeId: residents.homeId })
    .from(residents)
    .where(eq(residents.id, ownerId))
    .get();
  if (!resident) throw new NotFoundError("Owner resident not found.");
  assertActorMayAccessHome(db, actor, resident.homeId);
  return resident.homeId;
}

export function recordInventoryTransaction(
  db: AppDb,
  actor: SessionActor,
  input: RecordInventoryTransactionInput,
  nowUtcMs: number,
): RecordInventoryTransactionResult {
  const ownerType = input.ownerType;
  if (ownerType !== "HOME" && ownerType !== "RESIDENT") {
    throw new ValidationError("ownerType must be HOME or RESIDENT.");
  }
  const ownerId = normalizeRequiredString(input.ownerId, "ownerId");
  const itemId = normalizeRequiredString(input.itemId, "itemId");
  const transactionType = normalizeRequiredString(
    input.transactionType,
    "transactionType",
  );
  const transferId =
    input.transferId == null ? null : normalizeRequiredString(input.transferId, "transferId");
  const sourceType = normalizeRequiredString(input.sourceType, "sourceType");
  const sourceId = normalizeRequiredString(input.sourceId, "sourceId");

  const ownerHomeId = resolveOwnerHomeId(db, actor, ownerType, ownerId);
  const item = db
    .select({
      id: inventoryItems.id,
      homeId: inventoryItems.homeId,
      unitClass: inventoryItems.unitClass,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId))
    .get();
  if (!item) throw new NotFoundError("Inventory item not found.");
  if (item.homeId !== ownerHomeId) {
    throw new ValidationError("Item home must match owner home.");
  }
  if (item.unitClass !== "countable" && item.unitClass !== "measurable") {
    throw new ValidationError("Inventory item unit class is invalid.");
  }
  const quantityDeltaBaseUnits = Number(input.quantityDeltaBaseUnits);
  assertQuantityMatchesUnitClass(item.unitClass, quantityDeltaBaseUnits);
  const note = input.note == null ? null : input.note.trim() || null;

  const txId = randomUUID();
  const balanceRow = db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.ownerType, ownerType),
        eq(inventoryBalances.ownerId, ownerId),
        eq(inventoryBalances.itemId, itemId),
      ),
    )
    .get();
  const existing = balanceRow?.quantityBaseUnits ?? 0;
  const resulting = existing + quantityDeltaBaseUnits;

  db.transaction((trx) => {
    trx.insert(inventoryTransactions)
      .values({
        id: txId,
        ownerType,
        ownerId,
        itemId,
        transactionType,
        transferId,
        quantityDeltaBaseUnits,
        sourceType,
        sourceId,
        note,
        actorUserId: actor.userId,
        createdAtUtcMs: nowUtcMs,
      })
      .run();

    if (!balanceRow) {
      trx.insert(inventoryBalances)
        .values({
          id: randomUUID(),
          ownerType,
          ownerId,
          itemId,
          quantityBaseUnits: resulting,
          createdAtUtcMs: nowUtcMs,
          updatedAtUtcMs: nowUtcMs,
        })
        .run();
    } else {
      trx.update(inventoryBalances)
        .set({
          quantityBaseUnits: resulting,
          updatedAtUtcMs: nowUtcMs,
        })
        .where(eq(inventoryBalances.id, balanceRow.id))
        .run();
    }
  });

  return {
    transactionId: txId,
    ownerType,
    ownerId,
    itemId,
    transferId,
    quantityDeltaBaseUnits,
    resultingBalanceBaseUnits: resulting,
    sourceType,
    sourceId,
    note,
    createdAtUtcMs: nowUtcMs,
  };
}

export function dispenseInventory(
  db: AppDb,
  actor: SessionActor,
  input: DispenseInventoryInput,
  nowUtcMs: number,
): RecordInventoryTransactionResult {
  assertActorMayPerformInventoryAction(actor, "INVENTORY_DISPENSE");
  const quantityBaseUnits = Number(input.quantityBaseUnits);
  if (!Number.isFinite(quantityBaseUnits) || quantityBaseUnits <= 0) {
    throw new ValidationError("quantityBaseUnits must be greater than zero.");
  }
  return recordInventoryTransaction(
    db,
    actor,
    {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      itemId: input.itemId,
      transactionType: "DISPENSE",
      quantityDeltaBaseUnits: -quantityBaseUnits,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      note: input.note,
    },
    nowUtcMs,
  );
}

export function adjustInventory(
  db: AppDb,
  actor: SessionActor,
  input: AdjustInventoryInput,
  nowUtcMs: number,
): RecordInventoryTransactionResult {
  assertActorMayPerformInventoryAction(actor, "INVENTORY_ADJUST");
  const quantityBaseUnits = Number(input.quantityBaseUnits);
  if (!Number.isFinite(quantityBaseUnits) || quantityBaseUnits <= 0) {
    throw new ValidationError("quantityBaseUnits must be greater than zero.");
  }
  const adjustmentType = input.adjustmentType;
  if (adjustmentType !== "ADJUST_IN" && adjustmentType !== "ADJUST_OUT") {
    throw new ValidationError("adjustmentType must be ADJUST_IN or ADJUST_OUT.");
  }
  const reasonCode = input.reasonCode;
  if (
    reasonCode !== "DAMAGED" &&
    reasonCode !== "EXPIRED" &&
    reasonCode !== "COUNT_CORRECTION" &&
    reasonCode !== "OTHER"
  ) {
    throw new ValidationError("reasonCode is required.");
  }
  const normalizedNote = input.note == null ? null : input.note.trim() || null;
  if (reasonCode === "OTHER" && !normalizedNote) {
    throw new ValidationError("note is required when reasonCode is OTHER.");
  }
  const signedQuantity =
    adjustmentType === "ADJUST_IN" ? quantityBaseUnits : -quantityBaseUnits;
  return recordInventoryTransaction(
    db,
    actor,
    {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      itemId: input.itemId,
      transactionType: adjustmentType,
      quantityDeltaBaseUnits: signedQuantity,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      note: normalizedNote ? `[${reasonCode}] ${normalizedNote}` : `[${reasonCode}]`,
    },
    nowUtcMs,
  );
}

export function transferInventoryToResident(
  db: AppDb,
  actor: SessionActor,
  input: TransferInventoryToResidentInput,
  nowUtcMs: number,
): TransferInventoryToResidentResult {
  const homeId = normalizeRequiredString(input.homeId, "homeId");
  const residentId = normalizeRequiredString(input.residentId, "residentId");
  const itemId = normalizeRequiredString(input.itemId, "itemId");
  const sourceType = normalizeRequiredString(input.sourceType, "sourceType");
  const sourceId = normalizeRequiredString(input.sourceId, "sourceId");
  const note = input.note == null ? null : input.note.trim() || null;
  const quantityBaseUnits = Number(input.quantityBaseUnits);
  if (!Number.isFinite(quantityBaseUnits) || quantityBaseUnits <= 0) {
    throw new ValidationError("quantityBaseUnits must be greater than zero.");
  }
  if (!Number.isInteger(quantityBaseUnits)) {
    throw new ValidationError("quantityBaseUnits must be a base-unit integer.");
  }

  const sourceHome = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!sourceHome) throw new NotFoundError("Source home not found.");
  assertActorMayAccessHome(db, actor, sourceHome.id);

  const resident = db
    .select({ id: residents.id, homeId: residents.homeId })
    .from(residents)
    .where(eq(residents.id, residentId))
    .get();
  if (!resident) throw new NotFoundError("Resident not found.");
  if (resident.homeId !== homeId) {
    throw new ValidationError("Resident must belong to the same home as source.");
  }

  const item = db
    .select({
      id: inventoryItems.id,
      homeId: inventoryItems.homeId,
      unitClass: inventoryItems.unitClass,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId))
    .get();
  if (!item) throw new NotFoundError("Inventory item not found.");
  if (item.homeId !== homeId) {
    throw new ValidationError("Item home must match source home.");
  }
  if (item.unitClass !== "countable") {
    throw new ValidationError("Home-to-resident transfer requires base-unit integer items.");
  }

  const homeBalance = db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.ownerType, "HOME"),
        eq(inventoryBalances.ownerId, homeId),
        eq(inventoryBalances.itemId, itemId),
      ),
    )
    .get();
  const residentBalance = db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.ownerType, "RESIDENT"),
        eq(inventoryBalances.ownerId, residentId),
        eq(inventoryBalances.itemId, itemId),
      ),
    )
    .get();
  const nextHome = (homeBalance?.quantityBaseUnits ?? 0) - quantityBaseUnits;
  const nextResident = (residentBalance?.quantityBaseUnits ?? 0) + quantityBaseUnits;
  const transferId = randomUUID();

  db.transaction((trx) => {
    trx.insert(inventoryTransactions)
      .values([
        {
          id: randomUUID(),
          ownerType: "HOME",
          ownerId: homeId,
          itemId,
          transactionType: "TRANSFER_OUT",
          transferId,
          quantityDeltaBaseUnits: -quantityBaseUnits,
          sourceType,
          sourceId,
          note,
          actorUserId: actor.userId,
          createdAtUtcMs: nowUtcMs,
        },
        {
          id: randomUUID(),
          ownerType: "RESIDENT",
          ownerId: residentId,
          itemId,
          transactionType: "TRANSFER_IN",
          transferId,
          quantityDeltaBaseUnits: quantityBaseUnits,
          sourceType,
          sourceId,
          note,
          actorUserId: actor.userId,
          createdAtUtcMs: nowUtcMs,
        },
      ])
      .run();

    if (!homeBalance) {
      trx.insert(inventoryBalances)
        .values({
          id: randomUUID(),
          ownerType: "HOME",
          ownerId: homeId,
          itemId,
          quantityBaseUnits: nextHome,
          createdAtUtcMs: nowUtcMs,
          updatedAtUtcMs: nowUtcMs,
        })
        .run();
    } else {
      trx.update(inventoryBalances)
        .set({
          quantityBaseUnits: nextHome,
          updatedAtUtcMs: nowUtcMs,
        })
        .where(eq(inventoryBalances.id, homeBalance.id))
        .run();
    }

    if (!residentBalance) {
      trx.insert(inventoryBalances)
        .values({
          id: randomUUID(),
          ownerType: "RESIDENT",
          ownerId: residentId,
          itemId,
          quantityBaseUnits: nextResident,
          createdAtUtcMs: nowUtcMs,
          updatedAtUtcMs: nowUtcMs,
        })
        .run();
    } else {
      trx.update(inventoryBalances)
        .set({
          quantityBaseUnits: nextResident,
          updatedAtUtcMs: nowUtcMs,
        })
        .where(eq(inventoryBalances.id, residentBalance.id))
        .run();
    }
  });

  return {
    transferId,
    itemId,
    homeId,
    residentId,
    quantityBaseUnits,
    homeResultingBalanceBaseUnits: nextHome,
    residentResultingBalanceBaseUnits: nextResident,
    createdAtUtcMs: nowUtcMs,
  };
}
