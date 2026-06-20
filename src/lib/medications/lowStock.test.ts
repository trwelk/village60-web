import Database from "better-sqlite3";
import { openTestMemoryDb } from "@/test/pushTestSchema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  homes,
  homePurchaseOrderLines,
  homePurchaseOrders,
  inventoryBalances,
  inventoryItemCategories,
  inventoryItems,
  inventorySuppliers,
  residentMedications,
  residents,
  users,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { updateHome } from "@/lib/homes/service";
import { getLowStockMedications } from "./lowStock";

const adminActor = { userId: "u-admin", role: "admin" as const };

function seedCategory(db: AppDb, t: number, homeId: string, id = "cat-1") {
  db.insert(inventoryItemCategories)
    .values({
      id,
      homeId,
      name: "Medication",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  return id;
}

function seedFixture(db: AppDb, t: number) {
  db.insert(homes)
    .values({
      id: "h1",
      name: "Home 1",
      defaultCurrencyCode: "USD",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  const catId = seedCategory(db, t, "h1");
  db.insert(inventoryItems)
    .values([
      {
        id: "item-sched",
        homeId: "h1",
        categoryId: catId,
        name: "Aspirin",
        baseUnit: "tablet",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
      {
        id: "item-prn",
        homeId: "h1",
        categoryId: catId,
        name: "Paracetamol",
        baseUnit: "tablet",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
    ])
    .run();
  db.insert(residents)
    .values([
      {
        id: "r1",
        homeId: "h1",
        fullName: "Alice Active",
        normalizedFullName: "alice active",
        dob: "1940-01-01",
        admissionDate: "2024-01-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
      {
        id: "r2",
        homeId: "h1",
        fullName: "Bob Departed",
        normalizedFullName: "bob departed",
        dob: "1940-01-01",
        admissionDate: "2024-01-01",
        status: "departed",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
    ])
    .run();
  db.insert(residentMedications)
    .values([
      {
        id: "rm-sched",
        residentId: "r1",
        itemId: "item-sched",
        quantityPerServing: 1,
        servingsPerDay: 2,
        directions: "Take twice daily",
        prn: false,
        scheduledSlots: JSON.stringify(["morning", "evening"]),
        status: "active",
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
      {
        id: "rm-prn",
        residentId: "r1",
        itemId: "item-prn",
        quantityPerServing: 2,
        directions: "As needed",
        prn: true,
        status: "active",
        sortOrder: 1,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
    ])
    .run();
}

function setResidentBalance(
  db: AppDb,
  t: number,
  residentId: string,
  itemId: string,
  quantity: number,
) {
  db.insert(inventoryBalances)
    .values({
      id: `bal-${residentId}-${itemId}`,
      ownerType: "RESIDENT",
      ownerId: residentId,
      itemId,
      quantityBaseUnits: quantity,
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
}

function seedPendingPoLine(
  db: AppDb,
  t: number,
  input: {
    residentId: string;
    itemId: string;
    quantityOrderedBaseUnits: number;
    quantityReceivedBaseUnits?: number;
    poStatus?: string;
    lineStatus?: string;
  },
) {
  db.insert(users)
    .values({
      id: "u-admin",
      email: "admin@test.local",
      passwordHash: "x",
      role: "admin",
      createdAtUtcMs: t,
    })
    .onConflictDoNothing()
    .run();
  db.insert(inventorySuppliers)
    .values({
      id: "sup-1",
      name: "Pharmacy",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .onConflictDoNothing()
    .run();
  db.insert(homePurchaseOrders)
    .values({
      id: "po-1",
      homeId: "h1",
      poNumber: "PO-00001",
      supplierId: "sup-1",
      status: input.poStatus ?? "DRAFT",
      createdByUserId: "u-admin",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .onConflictDoNothing()
    .run();
  db.insert(homePurchaseOrderLines)
    .values({
      id: `po-line-${input.residentId}-${input.itemId}`,
      purchaseOrderId: "po-1",
      itemId: input.itemId,
      ownerType: "RESIDENT",
      ownerId: input.residentId,
      purchaseUnitType: "tablet",
      quantityOrderedBaseUnits: input.quantityOrderedBaseUnits,
      quantityReceivedBaseUnits: input.quantityReceivedBaseUnits ?? 0,
      status: input.lineStatus ?? "OPEN",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
}

describe("getLowStockMedications", () => {
  let sqlite: Database.Database | undefined;

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
  });

  it("returns empty when all medications are above thresholds", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    setResidentBalance(db, t, "r1", "item-sched", 20);
    setResidentBalance(db, t, "r1", "item-prn", 20);

    const items = getLowStockMedications(db, adminActor, "h1");
    expect(items).toEqual([]);
  });

  it("flags scheduled meds below days threshold using resolved slots", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    setResidentBalance(db, t, "r1", "item-sched", 8);
    setResidentBalance(db, t, "r1", "item-prn", 20);

    const items = getLowStockMedications(db, adminActor, "h1");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      residentId: "r1",
      itemId: "item-sched",
      prn: false,
      slotsPerDay: 2,
      dailyBurn: 2,
      daysRemaining: 4,
      threshold: 5,
      urgency: "warning",
    });
  });

  it("flags PRN meds below servings threshold", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    setResidentBalance(db, t, "r1", "item-sched", 20);
    setResidentBalance(db, t, "r1", "item-prn", 8);

    const items = getLowStockMedications(db, adminActor, "h1");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemId: "item-prn",
      prn: true,
      servingsRemaining: 4,
      threshold: 5,
      urgency: "warning",
    });
  });

  it("marks critical urgency below 2 days or servings", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    setResidentBalance(db, t, "r1", "item-sched", 2);
    setResidentBalance(db, t, "r1", "item-prn", 2);

    const items = getLowStockMedications(db, adminActor, "h1");
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.urgency === "critical")).toBe(true);
  });

  it("flags zero on-hand medications as critical", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    // No balance rows — same as 0 on hand in the UI.

    const items = getLowStockMedications(db, adminActor, "h1");
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.urgency === "critical")).toBe(true);
    expect(items.every((item) => item.onHandBaseUnits === 0)).toBe(true);
    const scheduled = items.find((item) => !item.prn);
    expect(scheduled).toMatchObject({
      daysRemaining: 0,
      suggestedOrderQuantityBaseUnits: 28,
    });
  });

  it("skips inactive residents", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    db.insert(residentMedications)
      .values({
        id: "rm-departed",
        residentId: "r2",
        itemId: "item-prn",
        quantityPerServing: 1,
        directions: "PRN",
        prn: true,
        status: "active",
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    setResidentBalance(db, t, "r2", "item-prn", 2);
    setResidentBalance(db, t, "r1", "item-prn", 2);

    const items = getLowStockMedications(db, adminActor, "h1");
    expect(items.some((item) => item.residentId === "r2")).toBe(false);
    expect(items.some((item) => item.itemId === "item-sched")).toBe(true);
    expect(items.some((item) => item.itemId === "item-prn")).toBe(true);
  });

  it("respects per-home configurable thresholds", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    updateHome(db, "admin", "h1", {
      medLowStockDaysThreshold: 3,
      medLowStockServingsThreshold: 3,
    });
    setResidentBalance(db, t, "r1", "item-sched", 8);
    setResidentBalance(db, t, "r1", "item-prn", 8);

    const items = getLowStockMedications(db, adminActor, "h1");
    expect(items).toEqual([]);
  });

  it("suggests order quantity to reach threshold stock level", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    setResidentBalance(db, t, "r1", "item-sched", 8);
    setResidentBalance(db, t, "r1", "item-prn", 20);

    const items = getLowStockMedications(db, adminActor, "h1");
    const scheduled = items.find((item) => item.itemId === "item-sched");
    expect(scheduled?.suggestedOrderQuantityBaseUnits).toBe(20);
  });

  it("excludes medications covered by pending purchase order lines", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    seedPendingPoLine(db, t, {
      residentId: "r1",
      itemId: "item-sched",
      quantityOrderedBaseUnits: 10,
    });

    const items = getLowStockMedications(db, adminActor, "h1");
    expect(items.some((item) => item.itemId === "item-sched")).toBe(false);
  });

  it("still flags medications when pending order quantity is insufficient", () => {
    const { db, sqlite: s } = openTestMemoryDb();
    sqlite = s;
    const t = Date.now();
    seedFixture(db, t);
    seedPendingPoLine(db, t, {
      residentId: "r1",
      itemId: "item-sched",
      quantityOrderedBaseUnits: 4,
    });

    const items = getLowStockMedications(db, adminActor, "h1");
    const scheduled = items.find((item) => item.itemId === "item-sched");
    expect(scheduled).toMatchObject({
      onHandBaseUnits: 0,
      pendingIncomingBaseUnits: 4,
      effectiveOnHandBaseUnits: 4,
      daysRemaining: 2,
      urgency: "warning",
    });
    expect(scheduled?.suggestedOrderQuantityBaseUnits).toBe(24);
  });
});
