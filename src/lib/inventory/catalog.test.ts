import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  homePurchaseOrderLines,
  homePurchaseOrders,
  homes,
  inventoryItemCategories,
  inventoryItems,
  inventorySuppliers,
  users,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ValidationError } from "@/lib/homes/errors";
import {
  createHomeInventoryItem,
  createInventorySupplier,
  deleteHomeInventoryItem,
  deleteInventorySupplier,
  listHomeInventoryItems,
  listInventorySuppliers,
} from "./catalog";

function openMemoryDb(): { db: AppDb; sqlite: Database.Database } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db, sqlite };
}

const adminActor = { userId: "u-admin", role: "admin" as const };

function seedCategory(db: AppDb, homeId: string, categoryId: string, t: number) {
  db.insert(inventoryItemCategories)
    .values({
      id: categoryId,
      homeId,
      name: "General",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
}

describe("inventory catalog", () => {
  const connections: Database.Database[] = [];

  afterEach(() => {
    for (const c of connections) c.close();
    connections.length = 0;
  });

  it("scopes items by home and suppliers globally", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    db.insert(users)
      .values({
        id: adminActor.userId,
        email: "admin@test.local",
        passwordHash: "x",
        role: "admin",
        createdAtUtcMs: t,
      })
      .run();
    db.insert(homes)
      .values([
        {
          id: "h1",
          name: "Home 1",
          defaultCurrencyCode: "USD",
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        },
        {
          id: "h2",
          name: "Home 2",
          defaultCurrencyCode: "USD",
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        },
      ])
      .run();
    seedCategory(db, "h1", "c1", t);
    seedCategory(db, "h2", "c2", t);

    createInventorySupplier(db, adminActor, { name: "S1" }, t + 1);
    createInventorySupplier(db, adminActor, { name: "S2" }, t + 2);
    createHomeInventoryItem(
      db,
      adminActor,
      { homeId: "h1", categoryId: "c1", name: "Pads", baseUnit: "each", unitClass: "countable" },
      t + 3,
    );
    createHomeInventoryItem(
      db,
      adminActor,
      {
        homeId: "h2",
        categoryId: "c2",
        name: "Liquid",
        baseUnit: "ml",
        unitClass: "measurable",
      },
      t + 4,
    );

    expect(listInventorySuppliers(db, adminActor)).toHaveLength(2);
    expect(listHomeInventoryItems(db, adminActor, "h1")).toHaveLength(1);
  });

  it("stores supplier contact fields and normalizes blank values to null", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    db.insert(users)
      .values({
        id: adminActor.userId,
        email: "admin@test.local",
        passwordHash: "x",
        role: "admin",
        createdAtUtcMs: t,
      })
      .run();
    db.insert(homes)
      .values({
        id: "h1",
        name: "Home 1",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    const supplier = createInventorySupplier(
      db,
      adminActor,
      {
        name: "Supplier X",
        address: " 12 Main St ",
        phone: " ",
        email: " contact@supplier.test ",
      },
      t + 1,
    );

    const fetched = db
      .select()
      .from(inventorySuppliers)
      .where(eq(inventorySuppliers.id, supplier.id))
      .get();
    expect(fetched?.name).toBe("Supplier X");
    expect(fetched?.address).toBe("12 Main St");
    expect(fetched?.phone).toBeNull();
    expect(fetched?.email).toBe("contact@supplier.test");
  });

  it("blocks deleting referenced item when closed or received history exists", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    db.insert(users)
      .values({
        id: adminActor.userId,
        email: "admin@test.local",
        passwordHash: "x",
        role: "admin",
        createdAtUtcMs: t,
      })
      .run();
    db.insert(homes)
      .values({
        id: "h1",
        name: "Home 1",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventorySuppliers)
      .values({
        id: "s1",
        name: "Supplier",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    seedCategory(db, "h1", "c1", t);
    db.insert(inventoryItems)
      .values({
        id: "item-1",
        homeId: "h1",
        categoryId: "c1",
        name: "Pads",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(homePurchaseOrders)
      .values({
        id: "po1",
        homeId: "h1",
        poNumber: "PO-00001",
        supplierId: "s1",
        status: "CLOSED",
        createdByUserId: adminActor.userId,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(homePurchaseOrderLines)
      .values({
        id: "line1",
        purchaseOrderId: "po1",
        itemId: "item-1",
        ownerType: "HOME",
        ownerId: "h1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 2,
        quantityReceivedBaseUnits: 0,
        status: "OPEN",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    expect(() =>
      deleteHomeInventoryItem(db, adminActor, { homeId: "h1", itemId: "item-1" }),
    ).toThrow(ValidationError);
  });

  it("blocks deleting supplier referenced by closed or received PO history", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    db.insert(users)
      .values({
        id: adminActor.userId,
        email: "admin@test.local",
        passwordHash: "x",
        role: "admin",
        createdAtUtcMs: t,
      })
      .run();
    db.insert(homes)
      .values({
        id: "h1",
        name: "Home 1",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventorySuppliers)
      .values({
        id: "s1",
        name: "Supplier",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(homePurchaseOrders)
      .values({
        id: "po1",
        homeId: "h1",
        poNumber: "PO-00001",
        supplierId: "s1",
        status: "CLOSED",
        createdByUserId: adminActor.userId,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    expect(() =>
      deleteInventorySupplier(db, adminActor, { supplierId: "s1" }),
    ).toThrow(ValidationError);
  });

  it("allows deleting unreferenced item and supplier", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    db.insert(users)
      .values({
        id: adminActor.userId,
        email: "admin@test.local",
        passwordHash: "x",
        role: "admin",
        createdAtUtcMs: t,
      })
      .run();
    db.insert(homes)
      .values({
        id: "h1",
        name: "Home 1",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    seedCategory(db, "h1", "c1", t);
    const supplier = createInventorySupplier(db, adminActor, { name: "S1" }, t);
    const item = createHomeInventoryItem(
      db,
      adminActor,
      { homeId: "h1", categoryId: "c1", name: "Pads", baseUnit: "each", unitClass: "countable" },
      t,
    );

    deleteHomeInventoryItem(db, adminActor, { homeId: "h1", itemId: item.id });
    deleteInventorySupplier(db, adminActor, { supplierId: supplier.id });

    expect(
      db.select().from(inventoryItems).where(eq(inventoryItems.id, item.id)).get(),
    ).toBeUndefined();
    expect(
      db
        .select()
        .from(inventorySuppliers)
        .where(eq(inventorySuppliers.id, supplier.id))
        .get(),
    ).toBeUndefined();
  });
});
