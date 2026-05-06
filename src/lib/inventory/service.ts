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
import { NotFoundError, ValidationError } from "@/lib/homes/errors";

export type InventoryOwnerType = "HOME" | "RESIDENT";
export type InventoryUnitClass = "countable" | "measurable";

export type RecordInventoryTransactionInput = {
  ownerType: InventoryOwnerType;
  ownerId: string;
  itemId: string;
  transactionType: string;
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
  quantityDeltaBaseUnits: number;
  resultingBalanceBaseUnits: number;
  sourceType: string;
  sourceId: string;
  note: string | null;
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
    quantityDeltaBaseUnits,
    resultingBalanceBaseUnits: resulting,
    sourceType,
    sourceId,
    note,
    createdAtUtcMs: nowUtcMs,
  };
}
