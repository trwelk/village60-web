import { randomUUID } from "node:crypto";
import { and, asc, eq, exists, sql } from "drizzle-orm";
import {
  homePurchaseOrderLines,
  homePurchaseOrderReceiveEvents,
  homePurchaseOrders,
  homes,
  inventoryItemCategories,
  inventoryItems,
  inventorySuppliers,
} from "@/db/schema";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { listHomes, type AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

function required(value: string, label: string): string {
  const v = value.trim();
  if (!v) throw new ValidationError(`${label} is required.`);
  return v;
}

function optional(value: string | undefined): string | null {
  if (value === undefined) return null;
  const v = value.trim();
  return v === "" ? null : v;
}

function assertHomeAccess(db: AppDb, actor: SessionActor, homeId: string) {
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) throw new NotFoundError("Home not found.");
  assertActorMayAccessHome(db, actor, homeId);
}

function assertActorMayAccessAnyHome(db: AppDb, actor: SessionActor) {
  if (listHomes(db, actor).length === 0) {
    throw new ForbiddenError();
  }
}

export function listHomeInventoryItems(db: AppDb, actor: SessionActor, homeId: string) {
  assertHomeAccess(db, actor, homeId);
  return db
    .select({
      id: inventoryItems.id,
      homeId: inventoryItems.homeId,
      categoryId: inventoryItems.categoryId,
      categoryName: inventoryItemCategories.name,
      name: inventoryItems.name,
      baseUnit: inventoryItems.baseUnit,
      unitClass: inventoryItems.unitClass,
      createdAtUtcMs: inventoryItems.createdAtUtcMs,
      updatedAtUtcMs: inventoryItems.updatedAtUtcMs,
    })
    .from(inventoryItems)
    .innerJoin(
      inventoryItemCategories,
      eq(inventoryItemCategories.id, inventoryItems.categoryId),
    )
    .where(eq(inventoryItems.homeId, homeId))
    .orderBy(asc(inventoryItems.name), asc(inventoryItems.id))
    .all();
}

export function createHomeInventoryItem(
  db: AppDb,
  actor: SessionActor,
  input: {
    homeId: string;
    categoryId: string;
    name: string;
    baseUnit: string;
    unitClass: "countable" | "measurable";
  },
  nowUtcMs: number,
) {
  const homeId = required(input.homeId, "homeId");
  assertHomeAccess(db, actor, homeId);
  const categoryId = required(input.categoryId, "categoryId");
  const category = db
    .select({ id: inventoryItemCategories.id, homeId: inventoryItemCategories.homeId })
    .from(inventoryItemCategories)
    .where(eq(inventoryItemCategories.id, categoryId))
    .get();
  if (!category) throw new NotFoundError("Inventory item category not found.");
  if (category.homeId !== homeId) {
    throw new ValidationError("Inventory item category must belong to item home.");
  }
  const unitClass = input.unitClass;
  if (unitClass !== "countable" && unitClass !== "measurable") {
    throw new ValidationError("unitClass must be countable or measurable.");
  }
  const row = {
    id: randomUUID(),
    homeId,
    categoryId,
    name: required(input.name, "name"),
    baseUnit: required(input.baseUnit, "baseUnit"),
    unitClass,
    createdAtUtcMs: nowUtcMs,
    updatedAtUtcMs: nowUtcMs,
  };
  db.insert(inventoryItems).values(row).run();
  return row;
}

export function updateHomeInventoryItem(
  db: AppDb,
  actor: SessionActor,
  input: {
    homeId: string;
    itemId: string;
    categoryId: string;
    name: string;
    baseUnit: string;
    unitClass: "countable" | "measurable";
  },
  nowUtcMs: number,
) {
  const homeId = required(input.homeId, "homeId");
  const itemId = required(input.itemId, "itemId");
  const existing = db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.homeId, homeId)))
    .get();
  if (!existing) throw new NotFoundError("Inventory item not found.");
  assertHomeAccess(db, actor, homeId);
  const categoryId = required(input.categoryId, "categoryId");
  const category = db
    .select({ id: inventoryItemCategories.id, homeId: inventoryItemCategories.homeId })
    .from(inventoryItemCategories)
    .where(eq(inventoryItemCategories.id, categoryId))
    .get();
  if (!category) throw new NotFoundError("Inventory item category not found.");
  if (category.homeId !== homeId) {
    throw new ValidationError("Inventory item category must belong to item home.");
  }
  const unitClass = input.unitClass;
  if (unitClass !== "countable" && unitClass !== "measurable") {
    throw new ValidationError("unitClass must be countable or measurable.");
  }
  db.update(inventoryItems)
    .set({
      categoryId,
      name: required(input.name, "name"),
      baseUnit: required(input.baseUnit, "baseUnit"),
      unitClass,
      updatedAtUtcMs: nowUtcMs,
    })
    .where(eq(inventoryItems.id, itemId))
    .run();
}

export function deleteHomeInventoryItem(
  db: AppDb,
  actor: SessionActor,
  input: { homeId: string; itemId: string },
) {
  const homeId = required(input.homeId, "homeId");
  const itemId = required(input.itemId, "itemId");
  const existing = db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.homeId, homeId)))
    .get();
  if (!existing) throw new NotFoundError("Inventory item not found.");
  assertHomeAccess(db, actor, homeId);
  const protectedRef = db
    .select({ id: homePurchaseOrderLines.id })
    .from(homePurchaseOrderLines)
    .innerJoin(homePurchaseOrders, eq(homePurchaseOrders.id, homePurchaseOrderLines.purchaseOrderId))
    .where(
      and(
        eq(homePurchaseOrderLines.itemId, itemId),
        eq(homePurchaseOrders.homeId, homeId),
        sql`(${homePurchaseOrders.status} = 'CLOSED' OR ${homePurchaseOrderLines.quantityReceivedBaseUnits} > 0)`,
      ),
    )
    .limit(1)
    .get();
  if (protectedRef) {
    throw new ValidationError(
      "Inventory item cannot be deleted after closed PO reference or any receipt.",
    );
  }
  db.delete(inventoryItems).where(eq(inventoryItems.id, itemId)).run();
}

export function listHomeInventoryItemCategories(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
) {
  assertHomeAccess(db, actor, homeId);
  return db
    .select()
    .from(inventoryItemCategories)
    .where(eq(inventoryItemCategories.homeId, homeId))
    .orderBy(asc(inventoryItemCategories.name), asc(inventoryItemCategories.id))
    .all();
}

export function createHomeInventoryItemCategory(
  db: AppDb,
  actor: SessionActor,
  input: { homeId: string; name: string },
  nowUtcMs: number,
) {
  const homeId = required(input.homeId, "homeId");
  assertHomeAccess(db, actor, homeId);
  const row = {
    id: randomUUID(),
    homeId,
    name: required(input.name, "name"),
    createdAtUtcMs: nowUtcMs,
    updatedAtUtcMs: nowUtcMs,
  };
  db.insert(inventoryItemCategories).values(row).run();
  return row;
}

export function updateHomeInventoryItemCategory(
  db: AppDb,
  actor: SessionActor,
  input: { homeId: string; categoryId: string; name: string },
  nowUtcMs: number,
) {
  const homeId = required(input.homeId, "homeId");
  const categoryId = required(input.categoryId, "categoryId");
  const existing = db
    .select()
    .from(inventoryItemCategories)
    .where(
      and(
        eq(inventoryItemCategories.id, categoryId),
        eq(inventoryItemCategories.homeId, homeId),
      ),
    )
    .get();
  if (!existing) throw new NotFoundError("Inventory item category not found.");
  assertHomeAccess(db, actor, homeId);
  db.update(inventoryItemCategories)
    .set({
      name: required(input.name, "name"),
      updatedAtUtcMs: nowUtcMs,
    })
    .where(eq(inventoryItemCategories.id, categoryId))
    .run();
}

export function deleteHomeInventoryItemCategory(
  db: AppDb,
  actor: SessionActor,
  input: { homeId: string; categoryId: string },
) {
  const homeId = required(input.homeId, "homeId");
  const categoryId = required(input.categoryId, "categoryId");
  const existing = db
    .select()
    .from(inventoryItemCategories)
    .where(
      and(
        eq(inventoryItemCategories.id, categoryId),
        eq(inventoryItemCategories.homeId, homeId),
      ),
    )
    .get();
  if (!existing) throw new NotFoundError("Inventory item category not found.");
  assertHomeAccess(db, actor, homeId);
  const referenced = db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(eq(inventoryItems.categoryId, categoryId))
    .limit(1)
    .get();
  if (referenced) {
    throw new ValidationError("Inventory item category cannot be deleted while items use it.");
  }
  db.delete(inventoryItemCategories).where(eq(inventoryItemCategories.id, categoryId)).run();
}

export function listInventorySuppliers(db: AppDb, actor: SessionActor) {
  assertActorMayAccessAnyHome(db, actor);
  return db
    .select()
    .from(inventorySuppliers)
    .orderBy(asc(inventorySuppliers.name), asc(inventorySuppliers.id))
    .all();
}

export function createInventorySupplier(
  db: AppDb,
  actor: SessionActor,
  input: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  },
  nowUtcMs: number,
) {
  assertActorMayAccessAnyHome(db, actor);
  const row = {
    id: randomUUID(),
    name: required(input.name, "name"),
    address: optional(input.address),
    phone: optional(input.phone),
    email: optional(input.email),
    createdAtUtcMs: nowUtcMs,
    updatedAtUtcMs: nowUtcMs,
  };
  db.insert(inventorySuppliers).values(row).run();
  return row;
}

export function updateInventorySupplier(
  db: AppDb,
  actor: SessionActor,
  input: {
    supplierId: string;
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  },
  nowUtcMs: number,
) {
  const supplierId = required(input.supplierId, "supplierId");
  const existing = db
    .select()
    .from(inventorySuppliers)
    .where(eq(inventorySuppliers.id, supplierId))
    .get();
  if (!existing) throw new NotFoundError("Supplier not found.");
  assertActorMayAccessAnyHome(db, actor);
  db.update(inventorySuppliers)
    .set({
      name: required(input.name, "name"),
      address: optional(input.address),
      phone: optional(input.phone),
      email: optional(input.email),
      updatedAtUtcMs: nowUtcMs,
    })
    .where(eq(inventorySuppliers.id, supplierId))
    .run();
}

export function deleteInventorySupplier(
  db: AppDb,
  actor: SessionActor,
  input: { supplierId: string },
) {
  const supplierId = required(input.supplierId, "supplierId");
  const existing = db
    .select()
    .from(inventorySuppliers)
    .where(eq(inventorySuppliers.id, supplierId))
    .get();
  if (!existing) throw new NotFoundError("Supplier not found.");
  assertActorMayAccessAnyHome(db, actor);
  const closedRef = db
    .select({ id: homePurchaseOrders.id })
    .from(homePurchaseOrders)
    .where(
      and(
        eq(homePurchaseOrders.supplierId, supplierId),
        eq(homePurchaseOrders.status, "CLOSED"),
      ),
    )
    .limit(1)
    .get();
  if (closedRef) {
    throw new ValidationError("Supplier cannot be deleted after closed PO reference.");
  }
  const receivedRef = db
    .select({ id: homePurchaseOrders.id })
    .from(homePurchaseOrders)
    .where(
      and(
        eq(homePurchaseOrders.supplierId, supplierId),
        exists(
          db
            .select({ id: homePurchaseOrderReceiveEvents.id })
            .from(homePurchaseOrderReceiveEvents)
            .where(eq(homePurchaseOrderReceiveEvents.purchaseOrderId, homePurchaseOrders.id)),
        ),
      ),
    )
    .limit(1)
    .get();
  if (receivedRef) {
    throw new ValidationError("Supplier cannot be deleted after any PO receipt.");
  }
  db.delete(inventorySuppliers).where(eq(inventorySuppliers.id, supplierId)).run();
}

export function listHomeInventorySuppliers(db: AppDb, actor: SessionActor, homeId: string) {
  required(homeId, "homeId");
  return listInventorySuppliers(db, actor);
}

export function createHomeInventorySupplier(
  db: AppDb,
  actor: SessionActor,
  input: {
    homeId: string;
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  },
  nowUtcMs: number,
) {
  required(input.homeId, "homeId");
  return createInventorySupplier(
    db,
    actor,
    {
      name: input.name,
      address: input.address,
      phone: input.phone,
      email: input.email,
    },
    nowUtcMs,
  );
}

export function updateHomeInventorySupplier(
  db: AppDb,
  actor: SessionActor,
  input: {
    homeId: string;
    supplierId: string;
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  },
  nowUtcMs: number,
) {
  required(input.homeId, "homeId");
  return updateInventorySupplier(
    db,
    actor,
    {
      supplierId: input.supplierId,
      name: input.name,
      address: input.address,
      phone: input.phone,
      email: input.email,
    },
    nowUtcMs,
  );
}

export function deleteHomeInventorySupplier(
  db: AppDb,
  actor: SessionActor,
  input: { homeId: string; supplierId: string },
) {
  required(input.homeId, "homeId");
  return deleteInventorySupplier(db, actor, { supplierId: input.supplierId });
}
