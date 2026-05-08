import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { homes, inventoryItems, residents, users } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError } from "@/lib/homes/errors";
import { ValidationError } from "@/lib/homes/errors";
import {
  adjustInventory,
  dispenseInventory,
  recordInventoryTransaction,
  transferInventoryToResident,
} from "./service";

function openMemoryDb(): { db: AppDb; sqlite: Database.Database } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db, sqlite };
}

const adminActor = { userId: "u-admin", role: "admin" as const };

describe("inventory transaction service", () => {
  const connections: Database.Database[] = [];

  afterEach(() => {
    for (const c of connections) c.close();
    connections.length = 0;
  });

  it("writes ledger and materialized balance for home owner", () => {
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
        name: "Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventoryItems)
      .values({
        id: "item-c",
        homeId: "h1",
        name: "Syringe",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    const r1 = recordInventoryTransaction(
      db,
      adminActor,
      {
        ownerType: "HOME",
        ownerId: "h1",
        itemId: "item-c",
        transactionType: "RECEIVE",
        quantityDeltaBaseUnits: 5,
        sourceType: "RECEIVE_EVENT",
        sourceId: "ev-1",
      },
      t + 1,
    );
    expect(r1.resultingBalanceBaseUnits).toBe(5);

    const r2 = recordInventoryTransaction(
      db,
      adminActor,
      {
        ownerType: "HOME",
        ownerId: "h1",
        itemId: "item-c",
        transactionType: "ADJUST_OUT",
        quantityDeltaBaseUnits: -2,
        sourceType: "ADJUSTMENT",
        sourceId: "adj-1",
      },
      t + 2,
    );
    expect(r2.resultingBalanceBaseUnits).toBe(3);
    const txRows = db.select().from(schema.inventoryTransactions).all();
    expect(txRows).toHaveLength(2);
    const bal = db.select().from(schema.inventoryBalances).all();
    expect(bal).toHaveLength(1);
    expect(bal[0].quantityBaseUnits).toBe(3);
  });

  it("rejects invalid precision per unit class", () => {
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
        name: "Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventoryItems)
      .values([
        {
          id: "item-c",
          homeId: "h1",
          name: "Pads",
          baseUnit: "each",
          unitClass: "countable",
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        },
        {
          id: "item-m",
          homeId: "h1",
          name: "Syrup",
          baseUnit: "ml",
          unitClass: "measurable",
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        },
      ])
      .run();

    expect(() =>
      recordInventoryTransaction(
        db,
        adminActor,
        {
          ownerType: "HOME",
          ownerId: "h1",
          itemId: "item-c",
          transactionType: "RECEIVE",
          quantityDeltaBaseUnits: 1.5,
          sourceType: "RECEIVE_EVENT",
          sourceId: "ev-1",
        },
        t + 1,
      ),
    ).toThrow(ValidationError);

    expect(() =>
      recordInventoryTransaction(
        db,
        adminActor,
        {
          ownerType: "HOME",
          ownerId: "h1",
          itemId: "item-m",
          transactionType: "RECEIVE",
          quantityDeltaBaseUnits: 1.2345,
          sourceType: "RECEIVE_EVENT",
          sourceId: "ev-2",
        },
        t + 1,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects resident owner from a different home than item", () => {
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
    db.insert(residents)
      .values({
        id: "r1",
        homeId: "h1",
        fullName: "Resident One",
        normalizedFullName: "resident one",
        dob: "1950-01-01",
        admissionDate: "2025-01-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventoryItems)
      .values({
        id: "item-h2",
        homeId: "h2",
        name: "Tape",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    expect(() =>
      recordInventoryTransaction(
        db,
        adminActor,
        {
          ownerType: "RESIDENT",
          ownerId: "r1",
          itemId: "item-h2",
          transactionType: "RECEIVE",
          quantityDeltaBaseUnits: 1,
          sourceType: "RECEIVE_EVENT",
          sourceId: "ev-1",
        },
        t + 1,
      ),
    ).toThrow(ValidationError);
  });

  it("dispenses via centralized transaction path and allows negative stock", () => {
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
        name: "Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventoryItems)
      .values({
        id: "item-c",
        homeId: "h1",
        name: "Gloves",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    const result = dispenseInventory(
      db,
      adminActor,
      {
        ownerType: "HOME",
        ownerId: "h1",
        itemId: "item-c",
        quantityBaseUnits: 2,
        sourceType: "DISPENSE_UI",
        sourceId: "disp-1",
      },
      t + 1,
    );

    expect(result.quantityDeltaBaseUnits).toBe(-2);
    expect(result.resultingBalanceBaseUnits).toBe(-2);
    const tx = db.select().from(schema.inventoryTransactions).all();
    expect(tx).toHaveLength(1);
    expect(tx[0].transactionType).toBe("DISPENSE");
    expect(tx[0].sourceType).toBe("DISPENSE_UI");
    expect(tx[0].sourceId).toBe("disp-1");
  });

  it("requires adjustment reason code and enforces note for OTHER", () => {
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
        name: "Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventoryItems)
      .values({
        id: "item-c",
        homeId: "h1",
        name: "Pads",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    expect(() =>
      adjustInventory(
        db,
        adminActor,
        {
          ownerType: "HOME",
          ownerId: "h1",
          itemId: "item-c",
          adjustmentType: "ADJUST_OUT",
          quantityBaseUnits: 1,
          reasonCode: "OTHER",
          sourceType: "ADJUSTMENT_UI",
          sourceId: "adj-1",
        },
        t + 1,
      ),
    ).toThrow(ValidationError);

    const ok = adjustInventory(
      db,
      adminActor,
      {
        ownerType: "HOME",
        ownerId: "h1",
        itemId: "item-c",
        adjustmentType: "ADJUST_IN",
        quantityBaseUnits: 4,
        reasonCode: "COUNT_CORRECTION",
        sourceType: "ADJUSTMENT_UI",
        sourceId: "adj-2",
      },
      t + 2,
    );
    expect(ok.resultingBalanceBaseUnits).toBe(4);
    const row = db.select().from(schema.inventoryTransactions).all().at(-1);
    expect(row?.note).toBe("[COUNT_CORRECTION]");
  });

  it("blocks care users from adjustment permission gate", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    db.insert(homes)
      .values({
        id: "h1",
        name: "Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(users)
      .values({
        id: "u-care",
        email: "care@test.local",
        passwordHash: "x",
        role: "care",
        primaryHomeId: "h1",
        createdAtUtcMs: t,
      })
      .run();
    db.insert(inventoryItems)
      .values({
        id: "item-c",
        homeId: "h1",
        name: "Pads",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    expect(() =>
      adjustInventory(
        db,
        { userId: "u-care", role: "care" },
        {
          ownerType: "HOME",
          ownerId: "h1",
          itemId: "item-c",
          adjustmentType: "ADJUST_OUT",
          quantityBaseUnits: 1,
          reasonCode: "DAMAGED",
          sourceType: "ADJUSTMENT_UI",
          sourceId: "adj-1",
        },
        t + 1,
      ),
    ).toThrow(ForbiddenError);
  });

  it("creates atomic paired transfer rows with shared transferId", () => {
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
        name: "Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(residents)
      .values({
        id: "r1",
        homeId: "h1",
        fullName: "Resident One",
        normalizedFullName: "resident one",
        dob: "1950-01-01",
        admissionDate: "2025-01-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventoryItems)
      .values({
        id: "item-c",
        homeId: "h1",
        name: "Gloves",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    recordInventoryTransaction(
      db,
      adminActor,
      {
        ownerType: "HOME",
        ownerId: "h1",
        itemId: "item-c",
        transactionType: "RECEIVE",
        quantityDeltaBaseUnits: 10,
        sourceType: "RECEIVE_EVENT",
        sourceId: "ev-1",
      },
      t + 1,
    );

    const result = transferInventoryToResident(
      db,
      adminActor,
      {
        homeId: "h1",
        residentId: "r1",
        itemId: "item-c",
        quantityBaseUnits: 3,
        sourceType: "TRANSFER_UI",
        sourceId: "tr-1",
      },
      t + 2,
    );

    expect(result.transferId).toBeTruthy();
    expect(result.homeResultingBalanceBaseUnits).toBe(7);
    expect(result.residentResultingBalanceBaseUnits).toBe(3);
    const txRows = db
      .select()
      .from(schema.inventoryTransactions)
      .where(eq(schema.inventoryTransactions.sourceId, "tr-1"))
      .all();
    expect(txRows).toHaveLength(2);
    expect(new Set(txRows.map((r) => r.transactionType))).toEqual(
      new Set(["TRANSFER_OUT", "TRANSFER_IN"]),
    );
    expect(new Set(txRows.map((r) => r.transferId))).toEqual(new Set([result.transferId]));
  });

  it("enforces same-home and same-item constraints for transfer", () => {
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
    db.insert(residents)
      .values({
        id: "r2",
        homeId: "h2",
        fullName: "Resident Two",
        normalizedFullName: "resident two",
        dob: "1950-01-01",
        admissionDate: "2025-01-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventoryItems)
      .values({
        id: "item-h1",
        homeId: "h1",
        name: "Bandage",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    expect(() =>
      transferInventoryToResident(
        db,
        adminActor,
        {
          homeId: "h1",
          residentId: "r2",
          itemId: "item-h1",
          quantityBaseUnits: 1,
          sourceType: "TRANSFER_UI",
          sourceId: "tr-2",
        },
        t + 1,
      ),
    ).toThrow(ValidationError);
  });
});
