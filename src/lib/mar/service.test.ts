import Database from "better-sqlite3";
import { openTestMemoryDb } from "@/test/pushTestSchema";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  homes,
  inventoryBalances,
  inventoryItemCategories,
  inventoryItems,
  inventoryTransactions,
  medicationAdministrations,
  residentMedications,
  residents,
  users,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { recordInventoryTransaction } from "@/lib/inventory/service";
import {
  recordAdministration,
  recordPRN,
  undoAdministration,
} from "./service";

const adminActor = { userId: "u-admin", role: "admin" as const };
const careActor = { userId: "u-care", role: "care" as const, primaryHomeId: "h1" };

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

function residentBalance(
  db: AppDb,
  residentId: string,
  itemId: string,
): number | undefined {
  return db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.ownerType, "RESIDENT"),
        eq(inventoryBalances.ownerId, residentId),
        eq(inventoryBalances.itemId, itemId),
      ),
    )
    .get()?.quantityBaseUnits;
}

function seedMarFixture(db: AppDb, t: number) {
  db.insert(homes)
    .values({
      id: "h1",
      name: "Home 1",
      defaultCurrencyCode: "USD",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  db.insert(users)
    .values([
      {
        id: adminActor.userId,
        email: "admin@test.local",
        passwordHash: "x",
        role: "admin",
        createdAtUtcMs: t,
      },
      {
        id: careActor.userId,
        email: "care@test.local",
        passwordHash: "x",
        role: "care",
        primaryHomeId: "h1",
        createdAtUtcMs: t,
      },
    ])
    .run();
  const categoryId = seedCategory(db, t, "h1");
  db.insert(inventoryItems)
    .values({
      id: "item-med",
      homeId: "h1",
      categoryId,
      name: "Paracetamol",
      baseUnit: "tablet",
      unitClass: "countable",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  db.insert(residents)
    .values([
      {
        id: "r1",
        homeId: "h1",
        fullName: "Jane Doe",
        normalizedFullName: "jane doe",
        dob: "1940-01-01",
        admissionDate: "2024-01-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
      {
        id: "r2",
        homeId: "h1",
        fullName: "John Smith",
        normalizedFullName: "john smith",
        dob: "1938-05-05",
        admissionDate: "2024-02-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
    ])
    .run();
  db.insert(residentMedications)
    .values([
      {
        id: "rm-scheduled",
        residentId: "r1",
        itemId: "item-med",
        quantityPerServing: 2,
        servingsPerDay: 1,
        directions: "Take with food",
        prn: false,
        scheduledSlots: '["morning"]',
        status: "active",
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
      {
        id: "rm-prn",
        residentId: "r2",
        itemId: "item-med",
        quantityPerServing: 1,
        directions: "As needed for pain",
        prn: true,
        scheduledSlots: null,
        status: "active",
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      },
    ])
    .run();

  for (const residentId of ["r1", "r2"] as const) {
    recordInventoryTransaction(
      db,
      adminActor,
      {
        ownerType: "RESIDENT",
        ownerId: residentId,
        itemId: "item-med",
        transactionType: "RECEIVE",
        quantityDeltaBaseUnits: 100,
        sourceType: "TEST_SEED",
        sourceId: `seed-${residentId}`,
      },
      t + 1,
    );
  }
}

describe("MAR inventory integration", () => {
  const connections: Database.Database[] = [];

  afterEach(() => {
    for (const c of connections) c.close();
    connections.length = 0;
  });

  it("deducts resident inventory when a scheduled dose is recorded", () => {
    const { db, sqlite } = openTestMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    seedMarFixture(db, t);

    const admin = recordAdministration(db, careActor, "h1", {
      residentMedicationId: "rm-scheduled",
      slot: "morning",
      date: "2026-06-12",
    });

    const txRows = db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.sourceId, admin.id))
      .all();
    expect(txRows).toHaveLength(1);
    expect(txRows[0].transactionType).toBe("MAR_DISPENSE");
    expect(txRows[0].sourceType).toBe("MAR_ADMINISTRATION");
    expect(txRows[0].ownerType).toBe("RESIDENT");
    expect(txRows[0].ownerId).toBe("r1");
    expect(txRows[0].quantityDeltaBaseUnits).toBe(-2);

    expect(residentBalance(db, "r1", "item-med")).toBe(98);
    expect(residentBalance(db, "r2", "item-med")).toBe(100);
  });

  it("restores inventory when a dose is undone", () => {
    const { db, sqlite } = openTestMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    seedMarFixture(db, t);

    const admin = recordAdministration(db, careActor, "h1", {
      residentMedicationId: "rm-scheduled",
      slot: "morning",
      date: new Date().toISOString().slice(0, 10),
    });

    undoAdministration(db, careActor, "h1", admin.id);

    const adminRows = db.select().from(medicationAdministrations).all();
    expect(adminRows).toHaveLength(0);

    const txRows = db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.sourceType, "MAR_ADMINISTRATION_UNDO"))
      .all();
    expect(txRows).toHaveLength(1);
    expect(txRows[0].transactionType).toBe("MAR_DISPENSE_REVERSAL");
    expect(txRows[0].ownerType).toBe("RESIDENT");
    expect(txRows[0].ownerId).toBe("r1");
    expect(txRows[0].quantityDeltaBaseUnits).toBe(2);
    expect(txRows[0].sourceId).toBe(admin.id);

    expect(residentBalance(db, "r1", "item-med")).toBe(100);
  });

  it("stacks dose deductions per resident for the same item", () => {
    const { db, sqlite } = openTestMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    seedMarFixture(db, t);

    recordAdministration(db, careActor, "h1", {
      residentMedicationId: "rm-scheduled",
      slot: "morning",
      date: "2026-06-12",
    });
    recordPRN(db, careActor, "h1", {
      residentMedicationId: "rm-prn",
      date: "2026-06-12",
    });
    recordPRN(db, careActor, "h1", {
      residentMedicationId: "rm-prn",
      date: "2026-06-12",
    });

    const dispenseRows = db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.transactionType, "MAR_DISPENSE"))
      .all();
    expect(dispenseRows).toHaveLength(3);

    expect(residentBalance(db, "r1", "item-med")).toBe(98);
    expect(residentBalance(db, "r2", "item-med")).toBe(98);
  });

  it("deducts inventory for PRN administrations", () => {
    const { db, sqlite } = openTestMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    seedMarFixture(db, t);

    recordPRN(db, careActor, "h1", {
      residentMedicationId: "rm-prn",
      date: "2026-06-12",
      notes: "Headache",
    });

    const txRows = db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.transactionType, "MAR_DISPENSE"))
      .all();
    expect(txRows).toHaveLength(1);
    expect(txRows[0].ownerId).toBe("r2");
    expect(txRows[0].quantityDeltaBaseUnits).toBe(-1);

    expect(residentBalance(db, "r2", "item-med")).toBe(99);
    expect(residentBalance(db, "r1", "item-med")).toBe(100);
  });

  it("allows balance to go negative when stock is insufficient", () => {
    const { db, sqlite } = openTestMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    seedMarFixture(db, t);

    for (let i = 0; i < 101; i++) {
      recordPRN(db, careActor, "h1", {
        residentMedicationId: "rm-prn",
        date: "2026-06-12",
      });
    }

    expect(residentBalance(db, "r2", "item-med")).toBe(-1);
    expect(residentBalance(db, "r1", "item-med")).toBe(100);
  });
});
