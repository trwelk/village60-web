import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import {
  homes,
  medications,
  medicationOrderLines,
  medicationOrders,
  residentMedicationStockEvents,
  residentMedications,
  residents,
  users,
} from "@/db/schema";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/homes/errors";
import { normalizeFullNameForUniqueness } from "@/lib/residents/service";
import {
  addMedicationOrderLineForResident,
  approveMedicationOrder,
  cancelMedicationOrder,
  closeMedicationOrderLineShort,
  createOrMergeLowStockMedicationOrderForResident,
  createOrMergeMedicationOrderForResident,
  patchMedicationOrderApprovedLineQtys,
  placeMedicationOrder,
  receiveMedicationOrderLine,
  rejectMedicationOrder,
  removeMedicationOrderLine,
  unapproveMedicationOrder,
} from "./service";

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("medicationOrders service (34b)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `v60-med-ord-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  function seedHomeResidentMeds(opts: {
    adminId: string;
    careId: string;
    homeId: string;
    residentId: string;
    medId: string;
    resMedId: string;
    minimumInStock: number;
    currentStock: number;
    prn?: boolean;
  }) {
    const db = getDb();
    const t = Date.now();
    db.insert(homes)
      .values({
        id: opts.homeId,
        name: "Test Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(users)
      .values({
        id: opts.adminId,
        email: `adm-${opts.adminId}@example.com`,
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: null,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    db.insert(users)
      .values({
        id: opts.careId,
        email: `care-${opts.careId}@example.com`,
        passwordHash: "x",
        role: "care",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: opts.homeId,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    db.insert(residents)
      .values({
        id: opts.residentId,
        homeId: opts.homeId,
        fullName: "Test Resident",
        normalizedFullName: normalizeFullNameForUniqueness("Test Resident"),
        dob: "1940-01-01",
        admissionDate: "2020-01-01",
        wardId: null,
        roomText: null,
        status: "active",
        nokName: null,
        nokContact: null,
        nokRelationship: null,
        poaSameAsNok: false,
        poaName: null,
        poaContact: null,
        poaRelationship: null,
        assignedNurseUserId: null,
        assignedNurseDisplayOverride: null,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(medications)
      .values({
        id: opts.medId,
        homeId: opts.homeId,
        name: "Aspirin",
        strength: "100",
        unit: "mg",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(residentMedications)
      .values({
        id: opts.resMedId,
        residentId: opts.residentId,
        medicationId: opts.medId,
        quantityPerServing: 1,
        servingsPerDay: 1,
        directions: "Daily",
        prn: opts.prn ?? false,
        minimumInStock: opts.minimumInStock,
        status: "active",
        currentStock: opts.currentStock,
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    closeDbConnection();
  }

  it("throws ConflictError when nothing qualifies to order", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 30,
    });
    const db = getDb();
    expect(() =>
      createOrMergeMedicationOrderForResident(db, { userId: adminId, role: "admin" }, homeId, residentId),
    ).toThrow(ConflictError);
  });

  it("create-or-merge then merge replaces line quantities", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 25,
    });
    const db = getDb();
    const first = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    expect(first.order.status).toBe("pending");
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]!.orderedQty).toBe(5);

    closeDbConnection();
    const db2 = getDb();
    db2
      .update(residentMedications)
      .set({ currentStock: 20, updatedAtUtcMs: Date.now() })
      .where(eq(residentMedications.id, resMedId))
      .run();
    closeDbConnection();

    const db3 = getDb();
    const second = createOrMergeMedicationOrderForResident(
      db3,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    expect(second.order.id).toBe(first.order.id);
    expect(second.lines[0]!.orderedQty).toBe(10);
  });

  it("rejects approve for care user", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order } = createOrMergeMedicationOrderForResident(
      db,
      { userId: careId, role: "care" },
      homeId,
      residentId,
    );
    expect(() =>
      approveMedicationOrder(db, { userId: careId, role: "care" }, homeId, order.id),
    ).toThrow(ForbiddenError);
  });

  it("rejects cancel approved for care user", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order } = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    expect(() =>
      cancelMedicationOrder(db, { userId: careId, role: "care" }, homeId, order.id),
    ).toThrow(ForbiddenError);
  });

  it("allows care to cancel pending order", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order } = createOrMergeMedicationOrderForResident(
      db,
      { userId: careId, role: "care" },
      homeId,
      residentId,
    );
    const after = cancelMedicationOrder(db, { userId: careId, role: "care" }, homeId, order.id);
    expect(after.order.status).toBe("cancelled");
  });

  it("rejects invalid transitions", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order } = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    expect(() =>
      rejectMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id),
    ).toThrow(ValidationError);
  });

  it("admin can un-approve then patch line qty on approved order only", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const created = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    expect(() =>
      patchMedicationOrderApprovedLineQtys(
        db,
        { userId: adminId, role: "admin" },
        homeId,
        created.order.id,
        { [created.lines[0]!.residentMedicationId]: 99 },
      ),
    ).toThrow(ValidationError);

    const approved = approveMedicationOrder(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      created.order.id,
    );
    const patched = patchMedicationOrderApprovedLineQtys(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      approved.order.id,
      { [approved.lines[0]!.residentMedicationId]: 42 },
    );
    expect(patched.lines[0]!.orderedQty).toBe(42);

    const pendingAgain = unapproveMedicationOrder(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      approved.order.id,
    );
    expect(pendingAgain.order.status).toBe("pending");
  });

  it("adds first manual line by creating pending order on demand", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const detail = addMedicationOrderLineForResident(
      db,
      { userId: careId, role: "care" },
      homeId,
      residentId,
      resMedId,
      7,
    );
    expect(detail.order.status).toBe("pending");
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]!.residentMedicationId).toBe(resMedId);
    expect(detail.lines[0]!.orderedQty).toBe(7);
  });

  it("auto-unapproves when adding a line to an approved order", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const med1Id = randomUUID();
    const med2Id = randomUUID();
    const resMed1Id = randomUUID();
    const resMed2Id = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId: med1Id,
      resMedId: resMed1Id,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const now = Date.now();
    db.insert(medications)
      .values({
        id: med2Id,
        homeId,
        name: "B",
        strength: "5",
        unit: "mg",
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    db.insert(residentMedications)
      .values({
        id: resMed2Id,
        residentId,
        medicationId: med2Id,
        quantityPerServing: 1,
        servingsPerDay: 1,
        directions: "d",
        prn: false,
        minimumInStock: 5,
        status: "active",
        currentStock: 0,
        sortOrder: 1,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();

    const created = addMedicationOrderLineForResident(
      db,
      { userId: careId, role: "care" },
      homeId,
      residentId,
      resMed1Id,
      2,
    );
    const approved = approveMedicationOrder(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      created.order.id,
    );
    expect(approved.order.status).toBe("approved");

    const afterAdd = addMedicationOrderLineForResident(
      db,
      { userId: careId, role: "care" },
      homeId,
      residentId,
      resMed2Id,
      3,
    );
    expect(afterAdd.order.status).toBe("pending");
    expect(afterAdd.order.approvedAtUtcMs).toBeNull();
    expect(afterAdd.lines.some((ln) => ln.residentMedicationId === resMed2Id)).toBe(true);
  });

  it("auto-cancels order when last line is removed", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const created = addMedicationOrderLineForResident(
      db,
      { userId: careId, role: "care" },
      homeId,
      residentId,
      resMedId,
      2,
    );
    const lineId = created.lines[0]!.id;
    const after = removeMedicationOrderLine(
      db,
      { userId: careId, role: "care" },
      homeId,
      created.order.id,
      lineId,
    );
    expect(after.order.status).toBe("cancelled");
    expect(after.lines).toHaveLength(0);
  });

  it("rejects adding inactive resident medication lines", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    db.update(residentMedications)
      .set({ status: "discontinued", updatedAtUtcMs: Date.now() })
      .where(eq(residentMedications.id, resMedId))
      .run();
    expect(() =>
      addMedicationOrderLineForResident(
        db,
        { userId: careId, role: "care" },
        homeId,
        residentId,
        resMedId,
        1,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects non-positive ordered qty for manual line add", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    expect(() =>
      addMedicationOrderLineForResident(
        db,
        { userId: careId, role: "care" },
        homeId,
        residentId,
        resMedId,
        0,
      ),
    ).toThrow(ValidationError);
  });
});

describe("medicationOrders service (34c placement + receiving)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `v60-med-ord-34c-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  function seedOneLineOrder(opts: {
    adminId: string;
    careId: string;
    homeId: string;
    residentId: string;
    medId: string;
    resMedId: string;
    minimumInStock: number;
    currentStock: number;
  }) {
    const db = getDb();
    const t = Date.now();
    db.insert(homes)
      .values({
        id: opts.homeId,
        name: "Test Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(users)
      .values({
        id: opts.adminId,
        email: `adm-${opts.adminId}@example.com`,
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: null,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    db.insert(users)
      .values({
        id: opts.careId,
        email: `care-${opts.careId}@example.com`,
        passwordHash: "x",
        role: "care",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: opts.homeId,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    db.insert(residents)
      .values({
        id: opts.residentId,
        homeId: opts.homeId,
        fullName: "Test Resident",
        normalizedFullName: normalizeFullNameForUniqueness("Test Resident"),
        dob: "1940-01-01",
        admissionDate: "2020-01-01",
        wardId: null,
        roomText: null,
        status: "active",
        nokName: null,
        nokContact: null,
        nokRelationship: null,
        poaSameAsNok: false,
        poaName: null,
        poaContact: null,
        poaRelationship: null,
        assignedNurseUserId: null,
        assignedNurseDisplayOverride: null,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(medications)
      .values({
        id: opts.medId,
        homeId: opts.homeId,
        name: "Aspirin",
        strength: "100",
        unit: "mg",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(residentMedications)
      .values({
        id: opts.resMedId,
        residentId: opts.residentId,
        medicationId: opts.medId,
        quantityPerServing: 1,
        servingsPerDay: 1,
        directions: "Daily",
        prn: false,
        minimumInStock: opts.minimumInStock,
        status: "active",
        currentStock: opts.currentStock,
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    closeDbConnection();
  }

  it("admin places approved order → order_placed; care cannot place", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedOneLineOrder({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order } = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    expect(() =>
      placeMedicationOrder(db, { userId: careId, role: "care" }, homeId, order.id),
    ).toThrow(ForbiddenError);
    const placed = placeMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    expect(placed.order.status).toBe("order_placed");
    expect(placed.order.orderPlacedAtUtcMs).toBeTypeOf("number");
    expect(placed.lines[0]!.receivedQty).toBe(0);
  });

  it("receipt allows manual dispensing-unit amounts; updates stock and ledger link", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedOneLineOrder({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order, lines } = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    placeMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    const lineId = lines[0]!.id;
    const afterPartial = receiveMedicationOrderLine(
      db,
      { userId: careId, role: "care" },
      homeId,
      order.id,
      lineId,
      { amount: 300 },
    );
    expect(afterPartial.lines[0]!.receivedQty).toBe(300);
    expect(afterPartial.order.status).toBe("completed");

    const db2 = getDb();
    const rm = db2
      .select()
      .from(residentMedications)
      .where(eq(residentMedications.id, resMedId))
      .get()!;
    expect(rm.currentStock).toBe(300);

    const ev = db2
      .select()
      .from(residentMedicationStockEvents)
      .where(eq(residentMedicationStockEvents.medicationOrderLineId, lineId))
      .get()!;
    expect(ev.eventType).toBe("delivery");
    expect(ev.amount).toBe(300);
    expect(ev.residentMedicationId).toBe(resMedId);
    expect(afterPartial.order.completedAtUtcMs).toBeTypeOf("number");
  });

  it("idempotent receipt key does not double-apply stock", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedOneLineOrder({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order, lines } = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    placeMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    const lineId = lines[0]!.id;
    const key = "idem-1";
    receiveMedicationOrderLine(db, { userId: careId, role: "care" }, homeId, order.id, lineId, {
      amount: 2,
      idempotencyKey: key,
    });
    receiveMedicationOrderLine(db, { userId: careId, role: "care" }, homeId, order.id, lineId, {
      amount: 2,
      idempotencyKey: key,
    });
    const db2 = getDb();
    const rm = db2
      .select()
      .from(residentMedications)
      .where(eq(residentMedications.id, resMedId))
      .get()!;
    expect(rm.currentStock).toBe(2);
    const cnt = db2
      .select()
      .from(residentMedicationStockEvents)
      .where(eq(residentMedicationStockEvents.medicationOrderLineId, lineId))
      .all().length;
    expect(cnt).toBe(1);
  });

  it("cancel order_placed only with zero receipts (admin)", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedOneLineOrder({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order, lines } = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    placeMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    const cancelled = cancelMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    expect(cancelled.order.status).toBe("cancelled");

    const db2 = getDb();
    const { order: o2, lines: lines2 } = createOrMergeMedicationOrderForResident(
      db2,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db2, { userId: adminId, role: "admin" }, homeId, o2.id);
    placeMedicationOrder(db2, { userId: adminId, role: "admin" }, homeId, o2.id);
    receiveMedicationOrderLine(
      db2,
      { userId: careId, role: "care" },
      homeId,
      o2.id,
      lines2[0]!.id,
      { amount: 1 },
    );
    expect(() =>
      cancelMedicationOrder(db2, { userId: adminId, role: "admin" }, homeId, o2.id),
    ).toThrow(ValidationError);
  });

  it("close line short satisfies completion", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedOneLineOrder({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order, lines } = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    placeMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    const lineId = lines[0]!.id;
    const closed = closeMedicationOrderLineShort(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      order.id,
      lineId,
      { reason: "Vendor short shipment" },
    );
    expect(closed.order.status).toBe("completed");
    expect(closed.lines[0]!.closedShortReason).toBe("Vendor short shipment");
  });

  it("create-or-merge blocked while order_placed exists", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedOneLineOrder({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order } = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    placeMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    expect(() =>
      createOrMergeMedicationOrderForResident(
        db,
        { userId: adminId, role: "admin" },
        homeId,
        residentId,
      ),
    ).toThrow(ConflictError);
  });

  it("rejects PATCH line qty when order is placed", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedOneLineOrder({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 0,
    });
    const db = getDb();
    const { order, lines } = createOrMergeMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    placeMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, order.id);
    expect(() =>
      patchMedicationOrderApprovedLineQtys(
        db,
        { userId: adminId, role: "admin" },
        homeId,
        order.id,
        { [lines[0]!.residentMedicationId]: 5 },
      ),
    ).toThrow(ValidationError);
  });
});

describe("medicationOrders service (35b low-stock merge rules)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `v60-med-ord-35b-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  function seedHomeResidentMeds(opts: {
    adminId: string;
    careId: string;
    homeId: string;
    residentId: string;
    medId: string;
    resMedId: string;
    minimumInStock: number;
    currentStock: number;
  }) {
    const db = getDb();
    const t = Date.now();
    db.insert(homes)
      .values({
        id: opts.homeId,
        name: "Test Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(users)
      .values({
        id: opts.adminId,
        email: `adm-${opts.adminId}@example.com`,
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: null,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    db.insert(users)
      .values({
        id: opts.careId,
        email: `care-${opts.careId}@example.com`,
        passwordHash: "x",
        role: "care",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: opts.homeId,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    db.insert(residents)
      .values({
        id: opts.residentId,
        homeId: opts.homeId,
        fullName: "Test Resident",
        normalizedFullName: normalizeFullNameForUniqueness("Test Resident"),
        dob: "1940-01-01",
        admissionDate: "2020-01-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
        wardId: null,
        roomText: null,
        nokName: null,
        nokContact: null,
        nokRelationship: null,
        poaSameAsNok: false,
        poaName: null,
        poaContact: null,
        poaRelationship: null,
        assignedNurseUserId: null,
        assignedNurseDisplayOverride: null,
      })
      .run();
    db.insert(medications)
      .values({
        id: opts.medId,
        homeId: opts.homeId,
        name: "Aspirin",
        strength: "100",
        unit: "mg",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(residentMedications)
      .values({
        id: opts.resMedId,
        residentId: opts.residentId,
        medicationId: opts.medId,
        quantityPerServing: 1,
        servingsPerDay: 1,
        directions: "Daily",
        prn: false,
        minimumInStock: opts.minimumInStock,
        status: "active",
        currentStock: opts.currentStock,
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    closeDbConnection();
  }

  it("treats placed lines with receipts as satisfied for low-stock remainder", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 5,
    });
    
    const db = getDb();
    const first = createOrMergeLowStockMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    expect(first.lines[0]!.orderedQty).toBe(25);

    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, first.order.id);
    placeMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, first.order.id);

    // Any posted receipt marks the placed line as operationally satisfied.
    receiveMedicationOrderLine(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      first.order.id,
      first.lines[0]!.id,
      { amount: 2 }
    );

    const next = createOrMergeLowStockMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    expect(next.order.id).not.toBe(first.order.id);
    expect(next.lines[0]!.orderedQty).toBeGreaterThan(0);
  });

  it("applies merge rule max(existing, formula) and never auto-deletes existing lines", () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedHomeResidentMeds({
      adminId,
      careId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 5,
    });

    const db = getDb();
    const first = createOrMergeLowStockMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    expect(first.lines[0]!.orderedQty).toBe(25);

    approveMedicationOrder(db, { userId: adminId, role: "admin" }, homeId, first.order.id);
    patchMedicationOrderApprovedLineQtys(db, { userId: adminId, role: "admin" }, homeId, first.order.id, {
      [resMedId]: 30,
    });

    const second = createOrMergeLowStockMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );
    
    // It didn't change anything (max(30, 25) = 30), so it stays approved
    expect(second.order.status).toBe("approved");
    expect(second.lines[0]!.orderedQty).toBe(30);

    // Now let's change the stock so the formula requires > 30
    // e.g. currentStock = 0, minimumInStock = 20 -> formula = 20 * 3 - 0 = 60
    db.update(residentMedications)
      .set({ minimumInStock: 20, currentStock: 0 })
      .where(eq(residentMedications.id, resMedId))
      .run();

    const third = createOrMergeLowStockMedicationOrderForResident(
      db,
      { userId: adminId, role: "admin" },
      homeId,
      residentId,
    );

    // Now it changed (max(30, 60) = 60), so it reverts to pending
    expect(third.order.status).toBe("pending");
    expect(third.lines[0]!.orderedQty).toBe(60);
  });
});

function runLowStockMergeSmokeCli(
  dbPath: string,
  homeId: string,
  residentId: string,
  adminId: string,
): Promise<number> {
  const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const smoke = path.join(
    process.cwd(),
    "src",
    "lib",
    "medicationOrders",
    "orderWriteConcurrencySmoke.ts",
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [tsx, smoke, dbPath, homeId, residentId, adminId, "admin", "lowStock"],
      { cwd: process.cwd(), env: { ...process.env }, windowsHide: true },
    );
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && stderr) {
        // eslint-disable-next-line no-console
        console.error(stderr);
      }
      resolve(code ?? 1);
    });
  });
}

describe("medicationOrders service (35c integrity + concurrent writers)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `v60-med-ord-35c-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it(
    "parallel low-stock merges do not duplicate orders or lines",
    async () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    const t = Date.now();
    const db0 = getDb();
    db0
      .insert(homes)
      .values({
        id: homeId,
        name: "Test Home",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db0
      .insert(users)
      .values({
        id: adminId,
        email: `adm-${adminId}@example.com`,
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: null,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    db0
      .insert(users)
      .values({
        id: careId,
        email: `care-${careId}@example.com`,
        passwordHash: "x",
        role: "care",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: homeId,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    db0
      .insert(residents)
      .values({
        id: residentId,
        homeId,
        fullName: "Test Resident",
        normalizedFullName: normalizeFullNameForUniqueness("Test Resident"),
        dob: "1940-01-01",
        admissionDate: "2020-01-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
        wardId: null,
        roomText: null,
        nokName: null,
        nokContact: null,
        nokRelationship: null,
        poaSameAsNok: false,
        poaName: null,
        poaContact: null,
        poaRelationship: null,
        assignedNurseUserId: null,
        assignedNurseDisplayOverride: null,
      })
      .run();
    db0
      .insert(medications)
      .values({
        id: medId,
        homeId,
        name: "Aspirin",
        strength: "100",
        unit: "mg",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db0
      .insert(residentMedications)
      .values({
        id: resMedId,
        residentId,
        medicationId: medId,
        quantityPerServing: 1,
        servingsPerDay: 1,
        directions: "Daily",
        prn: false,
        minimumInStock: 10,
        status: "active",
        currentStock: 5,
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    closeDbConnection();

      const runs = 8;
      const codes = await Promise.all(
        Array.from({ length: runs }, () =>
          runLowStockMergeSmokeCli(dbPath, homeId, residentId, adminId),
        ),
      );
      expect(codes.every((c) => c === 0)).toBe(true);

      const db = getDb();
      const editable = db
        .select()
        .from(medicationOrders)
        .where(
          and(
            eq(medicationOrders.residentId, residentId),
            inArray(medicationOrders.status, ["pending", "approved"]),
          ),
        )
        .all();
      expect(editable).toHaveLength(1);
      const orderId = editable[0]!.id;
      const lines = db
        .select()
        .from(medicationOrderLines)
        .where(eq(medicationOrderLines.orderId, orderId))
        .all();
      const forMed = lines.filter((l) => l.residentMedicationId === resMedId);
      expect(forMed).toHaveLength(1);
      expect(forMed[0]!.orderedQty).toBe(25);
    },
    30_000,
  );
});
