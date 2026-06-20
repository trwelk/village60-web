import Database from "better-sqlite3";
import { openTestMemoryDb } from "@/test/pushTestSchema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  homePoNumberSeq,
  homePurchaseOrders,
  homes,
  inventoryItemCategories,
  inventoryItems,
  inventorySuppliers,
  residents,
  users,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, ValidationError } from "@/lib/homes/errors";
import {
  addPurchaseOrderLine,
  approvePurchaseOrder,
  cancelPurchaseOrderLineRemaining,
  closePurchaseOrderLine,
  createHomePurchaseOrder,
  deletePurchaseOrder,
  disapprovePurchaseOrder,
  receivePurchaseOrderLine,
  sendPurchaseOrder,
} from "./purchaseOrders";

const adminActor = { userId: "u-admin", role: "admin" as const };

function seedSupplier(db: AppDb, t: number, id = "sup-1", name = "Supplier 1") {
  db.insert(inventorySuppliers)
    .values({
      id,
      name,
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  return id;
}

function seedItemCategory(db: AppDb, t: number, homeId: string, id = "cat-1") {
  db.insert(inventoryItemCategories)
    .values({
      id,
      homeId,
      name: "General",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  return id;
}

describe("home purchase orders", () => {
  const connections: Database.Database[] = [];

  afterEach(() => {
    for (const c of connections) c.close();
    connections.length = 0;
  });

  it("generates monotonic per-home po_number", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const s2 = seedSupplier(db, t, "s2", "Supplier 2");
    const a = createHomePurchaseOrder(db, adminActor, { homeId: "h1", supplierId: s1 }, t + 1);
    const b = createHomePurchaseOrder(
      db,
      adminActor,
      { homeId: "h1", supplierId: s1 },
      t + 2,
    );
    const c = createHomePurchaseOrder(db, adminActor, { homeId: "h2", supplierId: s2 }, t + 3);
    expect(a.poNumber).toBe("PO-00001");
    expect(b.poNumber).toBe("PO-00002");
    expect(c.poNumber).toBe("PO-00001");
  });

  it("next po_number uses numeric order when digit width changes (lexicographic would collide)", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    db.insert(homePurchaseOrders)
      .values([
        {
          id: "po-gap-high",
          homeId: "h1",
          poNumber: "PO-100000",
          supplierId: s1,
          status: "DRAFT",
          createdByUserId: adminActor.userId,
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        },
        {
          id: "po-gap-low",
          homeId: "h1",
          poNumber: "PO-099999",
          supplierId: s1,
          status: "DRAFT",
          createdByUserId: adminActor.userId,
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        },
      ])
      .run();
    const next = createHomePurchaseOrder(db, adminActor, { homeId: "h1", supplierId: s1 }, t + 1);
    expect(next.poNumber).toBe("PO-100001");
  });

  it("bootstraps po_number sequence from existing rows when home_po_number_seq has no entry", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    db.insert(homePurchaseOrders)
      .values({
        id: "po-seed",
        homeId: "h1",
        poNumber: "PO-00012",
        supplierId: s1,
        status: "DRAFT",
        createdByUserId: adminActor.userId,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    const next = createHomePurchaseOrder(db, adminActor, { homeId: "h1", supplierId: s1 }, t + 1);
    expect(next.poNumber).toBe("PO-00013");
    const seq = db
      .select()
      .from(homePoNumberSeq)
      .where(eq(homePoNumberSeq.homeId, "h1"))
      .get();
    expect(seq?.lastSuffix).toBe(13);
  });

  it("requires explicit owner and enforces owner-home consistency", () => {
    const { db, sqlite } = openTestMemoryDb();
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
        id: "r-h2",
        homeId: "h2",
        fullName: "Resident 2",
        normalizedFullName: "resident 2",
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
        categoryId: seedItemCategory(db, t, "h1"),
        name: "Syringe",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(
      db,
      adminActor,
      { homeId: "h1", supplierId: s1 },
      t + 1,
    );

    expect(() =>
      addPurchaseOrderLine(
        db,
        adminActor,
        {
          purchaseOrderId: po.id,
          itemId: "item-h1",
          ownerType: "HOME",
          ownerId: "h2",
          purchaseUnitType: "each",
          quantityOrderedBaseUnits: 3,
        },
        t + 2,
      ),
    ).toThrow(ValidationError);

    expect(() =>
      addPurchaseOrderLine(
        db,
        adminActor,
        {
          purchaseOrderId: po.id,
          itemId: "item-h1",
          ownerType: "RESIDENT",
          ownerId: "r-h2",
          purchaseUnitType: "each",
          quantityOrderedBaseUnits: 3,
        },
        t + 3,
      ),
    ).toThrow(ValidationError);

    expect(() =>
      addPurchaseOrderLine(
        db,
        adminActor,
        {
          purchaseOrderId: po.id,
          itemId: "item-h1",
          ownerType: "HOME",
          ownerId: "h1",
          purchaseUnitType: "",
          quantityOrderedBaseUnits: 3,
        },
        t + 4,
      ),
    ).toThrow(ValidationError);
  });

  it("enforces approve before send transition", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(
      db,
      adminActor,
      { homeId: "h1", supplierId: s1 },
      t + 1,
    );
    expect(() => sendPurchaseOrder(db, adminActor, po.id, t + 2)).toThrow(
      ValidationError,
    );
    approvePurchaseOrder(db, adminActor, po.id, t + 3);
    sendPurchaseOrder(db, adminActor, po.id, t + 4);
    const row = db
      .select()
      .from(schema.homePurchaseOrders)
      .where(eq(schema.homePurchaseOrders.id, po.id))
      .get();
    expect(row?.status).toBe("SENT");
  });

  it("allows disapprove transition from approved to draft", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(db, adminActor, { homeId: "h1", supplierId: s1 }, t + 1);
    approvePurchaseOrder(db, adminActor, po.id, t + 2);
    disapprovePurchaseOrder(db, adminActor, po.id, t + 3);
    const row = db
      .select()
      .from(schema.homePurchaseOrders)
      .where(eq(schema.homePurchaseOrders.id, po.id))
      .get();
    expect(row?.status).toBe("DRAFT");
    expect(row?.approvedAtUtcMs).toBeNull();
    expect(row?.approvedByUserId).toBeNull();
  });

  it("enforces role checks for approval and send", () => {
    const { db, sqlite } = openTestMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
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
          id: "u-care",
          email: "care@test.local",
          passwordHash: "x",
          role: "care",
          primaryHomeId: "h1",
          createdAtUtcMs: t,
        },
      ])
      .run();
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(
      db,
      { userId: "u-care", role: "care" },
      { homeId: "h1", supplierId: s1 },
      t + 1,
    );
    expect(() =>
      approvePurchaseOrder(db, { userId: "u-care", role: "care" }, po.id, t + 2),
    ).toThrow(ForbiddenError);
  });

  it("receives partial then over-receive with immutable events and stock posting", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    db.insert(inventoryItems)
      .values({
        id: "item-h1",
        homeId: "h1",
        categoryId: seedItemCategory(db, t, "h1"),
        name: "Syringe",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(
      db,
      adminActor,
      { homeId: "h1", supplierId: s1 },
      t + 1,
    );
    const line = addPurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        itemId: "item-h1",
        ownerType: "HOME",
        ownerId: "h1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 5,
      },
      t + 2,
    );
    approvePurchaseOrder(db, adminActor, po.id, t + 3);
    sendPurchaseOrder(db, adminActor, po.id, t + 4);

    const first = receivePurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        purchaseOrderLineId: line.id,
        qtyReceivedEvent: 3,
        baseUnitsReceivedEvent: 3,
        unitPriceCents: 1050,
        currencyCode: "USD",
        receivedAtUtcMs: t + 5,
      },
      t + 5,
    );
    expect(first.lineQuantityReceivedBaseUnits).toBe(3);
    expect(first.lineStatus).toBe("PARTIALLY_RECEIVED");

    const second = receivePurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        purchaseOrderLineId: line.id,
        qtyReceivedEvent: 4,
        baseUnitsReceivedEvent: 4,
        unitPriceCents: 1125,
        currencyCode: "USD",
        receivedAtUtcMs: t + 6,
      },
      t + 6,
    );
    expect(second.lineQuantityReceivedBaseUnits).toBe(7);
    expect(second.lineStatus).toBe("RECEIVED");

    const eventRows = db.select().from(schema.homePurchaseOrderReceiveEvents).all();
    expect(eventRows).toHaveLength(2);
    expect(eventRows.map((r) => r.unitPriceCents)).toEqual([1050, 1125]);

    const lineRow = db
      .select()
      .from(schema.homePurchaseOrderLines)
      .where(eq(schema.homePurchaseOrderLines.id, line.id))
      .get();
    expect(lineRow?.quantityReceivedBaseUnits).toBe(7);
    expect(lineRow?.status).toBe("RECEIVED");
    expect(lineRow?.purchaseUnitType).toBe("each");

    const bal = db.select().from(schema.inventoryBalances).all();
    expect(bal).toHaveLength(1);
    expect(bal[0].quantityBaseUnits).toBe(7);

    const txRows = db.select().from(schema.inventoryTransactions).all();
    expect(txRows).toHaveLength(2);
    expect(txRows[0].sourceType).toBe("PO_RECEIVE_EVENT");
  });

  it("blocks receive on terminal line and enforces single currency per PO", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    db.insert(inventoryItems)
      .values({
        id: "item-h1",
        homeId: "h1",
        categoryId: seedItemCategory(db, t, "h1"),
        name: "Syringe",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(
      db,
      adminActor,
      { homeId: "h1", supplierId: s1 },
      t + 1,
    );
    const line = addPurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        itemId: "item-h1",
        ownerType: "HOME",
        ownerId: "h1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 1,
      },
      t + 2,
    );
    approvePurchaseOrder(db, adminActor, po.id, t + 3);
    sendPurchaseOrder(db, adminActor, po.id, t + 4);

    receivePurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        purchaseOrderLineId: line.id,
        qtyReceivedEvent: 1,
        baseUnitsReceivedEvent: 1,
        unitPriceCents: 100,
        currencyCode: "USD",
        receivedAtUtcMs: t + 5,
      },
      t + 5,
    );

    expect(() =>
      receivePurchaseOrderLine(
        db,
        adminActor,
        {
          purchaseOrderId: po.id,
          purchaseOrderLineId: line.id,
          qtyReceivedEvent: 1,
          baseUnitsReceivedEvent: 1,
          unitPriceCents: 100,
          currencyCode: "USD",
          receivedAtUtcMs: t + 6,
        },
        t + 6,
      ),
    ).toThrow(ValidationError);

    const po2 = createHomePurchaseOrder(
      db,
      adminActor,
      { homeId: "h1", supplierId: s1 },
      t + 7,
    );
    const line2 = addPurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po2.id,
        itemId: "item-h1",
        ownerType: "HOME",
        ownerId: "h1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 2,
      },
      t + 8,
    );
    approvePurchaseOrder(db, adminActor, po2.id, t + 9);
    sendPurchaseOrder(db, adminActor, po2.id, t + 10);
    receivePurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po2.id,
        purchaseOrderLineId: line2.id,
        qtyReceivedEvent: 1,
        baseUnitsReceivedEvent: 1,
        unitPriceCents: 200,
        currencyCode: "USD",
        receivedAtUtcMs: t + 11,
      },
      t + 11,
    );
    expect(() =>
      receivePurchaseOrderLine(
        db,
        adminActor,
        {
          purchaseOrderId: po2.id,
          purchaseOrderLineId: line2.id,
          qtyReceivedEvent: 1,
          baseUnitsReceivedEvent: 1,
          unitPriceCents: 200,
          currencyCode: "EUR",
          receivedAtUtcMs: t + 12,
        },
        t + 12,
      ),
    ).toThrow(ValidationError);
  });

  it("auto-closes purchase order when all lines are terminal", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    db.insert(inventoryItems)
      .values({
        id: "item-h1",
        homeId: "h1",
        categoryId: seedItemCategory(db, t, "h1"),
        name: "Syringe",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(db, adminActor, { homeId: "h1", supplierId: s1 }, t + 1);
    const l1 = addPurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        itemId: "item-h1",
        ownerType: "HOME",
        ownerId: "h1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 2,
      },
      t + 2,
    );
    const l2 = addPurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        itemId: "item-h1",
        ownerType: "HOME",
        ownerId: "h1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 5,
      },
      t + 3,
    );
    approvePurchaseOrder(db, adminActor, po.id, t + 4);
    sendPurchaseOrder(db, adminActor, po.id, t + 5);
    receivePurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        purchaseOrderLineId: l1.id,
        qtyReceivedEvent: 2,
        baseUnitsReceivedEvent: 2,
        unitPriceCents: 100,
        currencyCode: "USD",
        receivedAtUtcMs: t + 6,
      },
      t + 6,
    );
    closePurchaseOrderLine(
      db,
      adminActor,
      { purchaseOrderId: po.id, purchaseOrderLineId: l2.id },
      t + 7,
    );
    const poRow = db
      .select()
      .from(schema.homePurchaseOrders)
      .where(eq(schema.homePurchaseOrders.id, po.id))
      .get();
    expect(poRow?.status).toBe("CLOSED");
  });

  it("creates finalized invoices per billing owner when PO auto-closes", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    db.insert(schema.accounts)
      .values({
        id: "acc-r1",
        accountType: "resident",
        residentId: "r1",
        homeId: null,
        currencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(inventoryItems)
      .values({
        id: "item-h1",
        homeId: "h1",
        categoryId: seedItemCategory(db, t, "h1"),
        name: "Syringe",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(db, adminActor, { homeId: "h1", supplierId: s1 }, t + 1);
    const lHome = addPurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        itemId: "item-h1",
        ownerType: "HOME",
        ownerId: "h1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 1,
      },
      t + 2,
    );
    const lRes = addPurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        itemId: "item-h1",
        ownerType: "RESIDENT",
        ownerId: "r1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 1,
      },
      t + 3,
    );
    approvePurchaseOrder(db, adminActor, po.id, t + 4);
    sendPurchaseOrder(db, adminActor, po.id, t + 5);
    receivePurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        purchaseOrderLineId: lHome.id,
        qtyReceivedEvent: 1,
        baseUnitsReceivedEvent: 1,
        unitPriceCents: 100,
        currencyCode: "USD",
        receivedAtUtcMs: t + 6,
      },
      t + 6,
    );
    receivePurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        purchaseOrderLineId: lRes.id,
        qtyReceivedEvent: 1,
        baseUnitsReceivedEvent: 1,
        unitPriceCents: 250,
        currencyCode: "USD",
        receivedAtUtcMs: t + 7,
      },
      t + 7,
    );

    const poInvoices = db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.purchaseOrderId, po.id))
      .all();
    expect(poInvoices.length).toBe(2);

    const homeInvoice = poInvoices.find((i) => i.accountId !== "acc-r1");
    const resInvoice = poInvoices.find((i) => i.accountId === "acc-r1");
    expect(homeInvoice?.invNo).toMatch(/^INV-/);
    expect(resInvoice?.invNo).toMatch(/^INV-/);
    expect(homeInvoice?.invNo).not.toBe(resInvoice?.invNo);
    expect(poInvoices.every((i) => i.status === "finalized")).toBe(true);
    expect(homeInvoice?.totalMinorSnapshot).toBe(100);
    expect(resInvoice?.totalMinorSnapshot).toBe(250);

    const lines = db.select().from(schema.invoiceLineItems).all();
    expect(lines.length).toBe(2);
    expect(lines.every((l) => l.category === "General")).toBe(true);
    const amounts = lines.map((l) => l.amountMinor).sort((a, b) => a - b);
    expect(amounts).toEqual([100, 250]);

    const charges = db
      .select()
      .from(schema.billingTransactions)
      .where(eq(schema.billingTransactions.txnType, "charge"))
      .all();
    expect(charges.length).toBe(2);
    const chargeAmounts = charges.map((c) => c.amountMinor).sort((a, b) => a - b);
    expect(chargeAmounts).toEqual([100, 250]);
  });

  it("allows cancel only remaining unreceived quantity", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    db.insert(inventoryItems)
      .values({
        id: "item-h1",
        homeId: "h1",
        categoryId: seedItemCategory(db, t, "h1"),
        name: "Syringe",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(db, adminActor, { homeId: "h1", supplierId: s1 }, t + 1);
    const line = addPurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        itemId: "item-h1",
        ownerType: "HOME",
        ownerId: "h1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 5,
      },
      t + 2,
    );
    approvePurchaseOrder(db, adminActor, po.id, t + 3);
    sendPurchaseOrder(db, adminActor, po.id, t + 4);
    receivePurchaseOrderLine(
      db,
      adminActor,
      {
        purchaseOrderId: po.id,
        purchaseOrderLineId: line.id,
        qtyReceivedEvent: 2,
        baseUnitsReceivedEvent: 2,
        unitPriceCents: 100,
        currencyCode: "USD",
        receivedAtUtcMs: t + 5,
      },
      t + 5,
    );
    const canceled = cancelPurchaseOrderLineRemaining(
      db,
      adminActor,
      { purchaseOrderId: po.id, purchaseOrderLineId: line.id },
      t + 6,
    );
    expect(canceled.canceledRemainingBaseUnits).toBe(3);
    const row = db
      .select()
      .from(schema.homePurchaseOrderLines)
      .where(eq(schema.homePurchaseOrderLines.id, line.id))
      .get();
    expect(row?.status).toBe("CANCELED");
    expect(() =>
      receivePurchaseOrderLine(
        db,
        adminActor,
        {
          purchaseOrderId: po.id,
          purchaseOrderLineId: line.id,
          qtyReceivedEvent: 1,
          baseUnitsReceivedEvent: 1,
          unitPriceCents: 100,
          currencyCode: "USD",
          receivedAtUtcMs: t + 7,
        },
        t + 7,
      ),
    ).toThrow(ValidationError);
  });

  it("blocks purchase order delete after approval", () => {
    const { db, sqlite } = openTestMemoryDb();
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
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const draftPo = createHomePurchaseOrder(
      db,
      adminActor,
      { homeId: "h1", supplierId: s1 },
      t + 1,
    );
    deletePurchaseOrder(db, adminActor, draftPo.id);
    const approvedPo = createHomePurchaseOrder(
      db,
      adminActor,
      { homeId: "h1", supplierId: s1 },
      t + 2,
    );
    approvePurchaseOrder(db, adminActor, approvedPo.id, t + 3);
    expect(() => deletePurchaseOrder(db, adminActor, approvedPo.id)).toThrow(
      ValidationError,
    );
  });

  it("rolls back event and line update when ledger insert fails", () => {
    const { db, sqlite } = openTestMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    db.insert(users)
      .values({
        id: "u-bootstrap",
        email: "bootstrap@test.local",
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
    db.insert(inventoryItems)
      .values({
        id: "item-h1",
        homeId: "h1",
        categoryId: seedItemCategory(db, t, "h1"),
        name: "Syringe",
        baseUnit: "each",
        unitClass: "countable",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    const s1 = seedSupplier(db, t, "s1", "Supplier 1");
    const po = createHomePurchaseOrder(
      db,
      { userId: "u-bootstrap", role: "admin" },
      { homeId: "h1", supplierId: s1 },
      t + 1,
    );
    const line = addPurchaseOrderLine(
      db,
      { userId: "u-bootstrap", role: "admin" },
      {
        purchaseOrderId: po.id,
        itemId: "item-h1",
        ownerType: "HOME",
        ownerId: "h1",
        purchaseUnitType: "each",
        quantityOrderedBaseUnits: 5,
      },
      t + 2,
    );
    approvePurchaseOrder(db, { userId: "u-bootstrap", role: "admin" }, po.id, t + 3);
    sendPurchaseOrder(db, { userId: "u-bootstrap", role: "admin" }, po.id, t + 4);

    expect(() =>
      receivePurchaseOrderLine(
        db,
        { userId: "missing-user", role: "admin" },
        {
          purchaseOrderId: po.id,
          purchaseOrderLineId: line.id,
          qtyReceivedEvent: 1,
          baseUnitsReceivedEvent: 1,
          unitPriceCents: 200,
          currencyCode: "USD",
          receivedAtUtcMs: t + 5,
        },
        t + 5,
      ),
    ).toThrow();

    const events = db.select().from(schema.homePurchaseOrderReceiveEvents).all();
    expect(events).toHaveLength(0);
    const txRows = db.select().from(schema.inventoryTransactions).all();
    expect(txRows).toHaveLength(0);
    const balances = db.select().from(schema.inventoryBalances).all();
    expect(balances).toHaveLength(0);
    const lineRow = db
      .select()
      .from(schema.homePurchaseOrderLines)
      .where(eq(schema.homePurchaseOrderLines.id, line.id))
      .get();
    expect(lineRow?.quantityReceivedBaseUnits).toBe(0);
    expect(lineRow?.status).toBe("OPEN");
  });
});
