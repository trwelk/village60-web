import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { medications, residentMedications, residentMedicationStockEvents, users } from "@/db/schema";
import { createHomeMedicationCatalogRow } from "@/lib/homeMedications/catalog";
import { createHome } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { createUser } from "@/lib/users/service";
import {
  createResident,
} from "./service";
import {
  adjustResidentMedicationStock,
  createResidentAllergy,
  createResidentCondition,
  createResidentMedication,
  type CreateResidentMedicationInput,
  deleteResidentAllergy,
  deleteResidentCondition,
  deleteResidentMedication,
  listResidentClinical,
  logResidentMedicationPrnDispensed,
  updateResidentAllergy,
  updateResidentCondition,
  updateResidentMedication,
} from "./clinical";

const STRONG = "ChangeMeNow!1";
const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("resident clinical lists (08)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-clinical-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
    const db = getDb();
    db.insert(users).values({
      id: "admin-actor",
      email: "admin@example.com",
      passwordHash: "hash",
      role: "admin",
      createdAtUtcMs: Date.now(),
    }).run();
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("returns empty lists for a new resident", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const snap = listResidentClinical(db, adminActor, home.id, r.id);
    expect(snap.conditions).toEqual([]);
    expect(snap.allergies).toEqual([]);
    expect(snap.medications).toEqual([]);
  });

  it("creates, updates, and deletes conditions for a resident", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const c1 = createResidentCondition(db, adminActor, home.id, r.id, {
      label: "  Type 2 diabetes ",
    });
    expect(c1.label).toBe("Type 2 diabetes");
    let snap = listResidentClinical(db, adminActor, home.id, r.id);
    expect(snap.conditions.map((x) => x.label)).toEqual(["Type 2 diabetes"]);

    const c2 = createResidentCondition(db, adminActor, home.id, r.id, {
      label: "Hypertension",
    });
    snap = listResidentClinical(db, adminActor, home.id, r.id);
    expect(snap.conditions.map((x) => x.label)).toEqual([
      "Type 2 diabetes",
      "Hypertension",
    ]);

    updateResidentCondition(db, adminActor, home.id, r.id, c1.id, {
      label: "T2DM",
    });
    snap = listResidentClinical(db, adminActor, home.id, r.id);
    expect(snap.conditions.map((x) => x.label)).toEqual(["T2DM", "Hypertension"]);

    deleteResidentCondition(db, adminActor, home.id, r.id, c2.id);
    snap = listResidentClinical(db, adminActor, home.id, r.id);
    expect(snap.conditions.map((x) => x.label)).toEqual(["T2DM"]);
  });

  it("manages allergies with optional notes", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const a = createResidentAllergy(db, adminActor, home.id, r.id, {
      allergen: "Penicillin",
      notes: "  anaphylaxis history ",
    });
    expect(a.allergen).toBe("Penicillin");
    expect(a.notes).toBe("anaphylaxis history");

    const b = createResidentAllergy(db, adminActor, home.id, r.id, {
      allergen: "Latex",
    });
    expect(b.notes).toBeNull();

    updateResidentAllergy(db, adminActor, home.id, r.id, a.id, {
      notes: null,
    });
    let snap = listResidentClinical(db, adminActor, home.id, r.id);
    const row = snap.allergies.find((x) => x.id === a.id);
    expect(row?.notes).toBeNull();

    deleteResidentAllergy(db, adminActor, home.id, r.id, b.id);
    snap = listResidentClinical(db, adminActor, home.id, r.id);
    expect(snap.allergies.map((x) => x.allergen)).toEqual(["Penicillin"]);
  });

  it("manages medications including PRN, optional servings/day, and min-in-stock threshold", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const m = createResidentMedication(db, adminActor, home.id, r.id, {
      medication: {
        name: "Paracetamol",
        strength: "500 mg",
        unit: "tablet",
      },
      quantityPerServing: 1,
      servingsPerDay: null,
      directions: "  with food ",
      minimumInStock: 10,
      prn: true,
    });
    expect(m.medicationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(m.name).toBe("Paracetamol");
    expect(m.prn).toBe(true);
    expect(m.directions).toBe("with food");
    expect(m.servingsPerDay).toBeNull();
    expect(m.minimumInStock).toBe(10);
    expect(m.quantityPerServing).toBe(1);

    const m2 = createResidentMedication(db, adminActor, home.id, r.id, {
      medication: {
        name: "Metformin",
        strength: "500 mg",
        unit: "tablet",
      },
      quantityPerServing: 1,
      directions: "With breakfast and evening meal",
      servingsPerDay: 2,
      prn: false,
    });
    expect(m2.servingsPerDay).toBe(2);
    expect(m2.minimumInStock).toBeNull();

    updateResidentMedication(db, adminActor, home.id, r.id, m.id, {
      prn: false,
      directions: "after meals",
      servingsPerDay: 4,
      minimumInStock: null,
    });
    const snap = listResidentClinical(db, adminActor, home.id, r.id);
    const row = snap.medications.find((x) => x.id === m.id);
    expect(row?.prn).toBe(false);
    expect(row?.directions).toBe("after meals");
    expect(row?.servingsPerDay).toBe(4);
    expect(row?.minimumInStock).toBeNull();

    deleteResidentMedication(db, adminActor, home.id, r.id, m2.id);
    const after = listResidentClinical(db, adminActor, home.id, r.id);
    expect(after.medications.map((x) => x.name)).toEqual(["Paracetamol"]);
  });

  it("rejects empty clinical strings", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    expect(() =>
      createResidentCondition(db, adminActor, home.id, r.id, { label: "  " }),
    ).toThrow(ValidationError);
    expect(() =>
      createResidentAllergy(db, adminActor, home.id, r.id, { allergen: "" }),
    ).toThrow(ValidationError);
    expect(() =>
      createResidentMedication(db, adminActor, home.id, r.id, {
        medication: {
          name: "X",
          strength: "1 mg",
          unit: "tablet",
        },
        quantityPerServing: NaN,
        directions: "Take daily",
      }),
    ).toThrow(ValidationError);
  });

  it("requires quantity per serving even when PRN", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    expect(() =>
      createResidentMedication(db, adminActor, home.id, r.id, {
        medication: {
          name: "Morphine oral liquid",
          strength: "1 mg/mL",
          unit: "mL",
        },
        quantityPerServing: NaN as any,
        directions: "As directed",
        prn: true,
      }),
    ).toThrow(ValidationError);
  });

  it("does not let Care read or edit clinical data for a non-assigned home", async () => {
    const db = getDb();
    const mine = createHome(db, "admin", {
      name: "Mine",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: other.id,
      fullName: "Secret",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    createResidentCondition(db, adminActor, other.id, r.id, {
      label: "Hidden",
    });
    const care = await createUser(db, "admin", {
      email: "care-clinical@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: mine.id,
    });
    const actor = { userId: care.id, role: "care" as const };
    expect(() =>
      listResidentClinical(db, actor, other.id, r.id),
    ).toThrow(ForbiddenError);
    expect(() =>
      createResidentCondition(db, actor, other.id, r.id, { label: "X" }),
    ).toThrow(ForbiddenError);
  });

  it("returns NotFound when mutating a list row id from another resident", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r1 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const r2 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "B",
      dob: "1941-01-01",
      admissionDate: "2024-01-01",
    });
    const c = createResidentCondition(db, adminActor, home.id, r1.id, {
      label: "Only on A",
    });
    expect(() =>
      updateResidentCondition(db, adminActor, home.id, r2.id, c.id, {
        label: "hack",
      }),
    ).toThrow(NotFoundError);
    expect(() =>
      deleteResidentCondition(db, adminActor, home.id, r2.id, c.id),
    ).toThrow(NotFoundError);
  });

  it("lets Care manage clinical lists in an assigned home", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
    });
    const care = await createUser(db, "admin", {
      email: "care-clinical-ok@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const actor = { userId: care.id, role: "care" as const };
    createResidentCondition(db, actor, home.id, r.id, { label: "OK" });
    const snap = listResidentClinical(db, actor, home.id, r.id);
    expect(snap.conditions.map((x) => x.label)).toEqual(["OK"]);
  });

  it("31b: rejects both medicationId and nested medication", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const cat = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "A", strength: "1 mg", unit: "tab" },
      Date.now(),
    );
    expect(() =>
      createResidentMedication(db, adminActor, home.id, r.id, {
        medicationId: cat.id,
        medication: { name: "B", strength: "2 mg", unit: "tab" },
        quantityPerServing: 1,
        directions: "x",
      } as unknown as CreateResidentMedicationInput),
    ).toThrow(ValidationError);
  });

  it("31b: rejects duplicate resident + catalog assignment", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const cat = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Aspirin", strength: "100 mg", unit: "tablet" },
      Date.now(),
    );
    createResidentMedication(db, adminActor, home.id, r.id, {
      medicationId: cat.id,
      quantityPerServing: 1,
      directions: "daily",
    });
    expect(() =>
      createResidentMedication(db, adminActor, home.id, r.id, {
        medicationId: cat.id,
        quantityPerServing: 1,
        directions: "again",
      }),
    ).toThrow(ValidationError);
  });

  it("31b: rejects catalog medication from another home", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "O",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const foreignCat = createHomeMedicationCatalogRow(
      db,
      adminActor,
      other.id,
      { name: "X", strength: "1", unit: "u" },
      Date.now(),
    );
    expect(() =>
      createResidentMedication(db, adminActor, home.id, r.id, {
        medicationId: foreignCat.id,
        quantityPerServing: 1,
        directions: "d",
      }),
    ).toThrow(ValidationError);
  });

  it("31b: nested create rolls back when catalog row would duplicate", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const payload = {
      medication: {
        name: "DupCheck",
        strength: "5 mg",
        unit: "tablet",
      },
      quantityPerServing: 1,
      directions: "with water",
    };
    createResidentMedication(db, adminActor, home.id, r.id, payload);
    const residentMedCount = db.select().from(residentMedications).all().length;
    const catalogCount = db.select().from(medications).all().length;
    expect(() =>
      createResidentMedication(db, adminActor, home.id, r.id, payload),
    ).toThrow(ValidationError);
    expect(db.select().from(residentMedications).all().length).toBe(
      residentMedCount,
    );
    expect(db.select().from(medications).all().length).toBe(catalogCount);
  });

  it("31b: can reassign regimen line to another catalog row in same home", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const a = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Old", strength: "1", unit: "t" },
      Date.now(),
    );
    const b = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "New", strength: "2", unit: "t" },
      Date.now(),
    );
    const line = createResidentMedication(db, adminActor, home.id, r.id, {
      medicationId: a.id,
      quantityPerServing: 1,
      directions: "d",
    });
    const updated = updateResidentMedication(
      db,
      adminActor,
      home.id,
      r.id,
      line.id,
      { medicationId: b.id },
    );
    expect(updated.medicationId).toBe(b.id);
    expect(updated.name).toBe("New");
  });

  it("32a: can create resident medication with initial stock and see ledger event", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const m = createResidentMedication(db, adminActor, home.id, r.id, {
      medication: { name: "Aspirin", strength: "500mg", unit: "tablet" },
      quantityPerServing: 2,
      directions: "take with water",
      initialStock: 100,
    });

    expect(m.quantityPerServing).toBe(2);
    expect(m.status).toBe("active");
    expect(m.currentStock).toBe(100);

    const events = db
      .select()
      .from(residentMedicationStockEvents)
      .where(eq(residentMedicationStockEvents.residentMedicationId, m.id))
      .all();
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe("delivery");
    expect(events[0].amount).toBe(100);
  });

  it("32b: logs PRN dispense with negative ledger amount and decrements stock", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const m = createResidentMedication(db, adminActor, home.id, r.id, {
      medication: { name: "Ibuprofen", strength: "200mg", unit: "tablet" },
      quantityPerServing: 2,
      directions: "PRN pain",
      prn: true,
      initialStock: 20,
    });
    const updated = logResidentMedicationPrnDispensed(
      db,
      adminActor,
      home.id,
      r.id,
      m.id,
    );
    expect(updated.currentStock).toBe(18);

    const events = db
      .select()
      .from(residentMedicationStockEvents)
      .where(eq(residentMedicationStockEvents.residentMedicationId, m.id))
      .all()
      .sort((a, b) => a.createdAtUtcMs - b.createdAtUtcMs);
    expect(events.length).toBe(2);
    expect(events[1].eventType).toBe("prn_dispensed");
    expect(events[1].amount).toBe(-2);
  });

  it("32b: PRN dispense may drive stock negative", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const m = createResidentMedication(db, adminActor, home.id, r.id, {
      medication: { name: "X", strength: "1", unit: "u" },
      quantityPerServing: 1,
      directions: "PRN",
      prn: true,
      initialStock: 0,
    });
    const updated = logResidentMedicationPrnDispensed(
      db,
      adminActor,
      home.id,
      r.id,
      m.id,
    );
    expect(updated.currentStock).toBe(-1);
  });

  it("32b: rejects PRN dispense for scheduled medications", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const m = createResidentMedication(db, adminActor, home.id, r.id, {
      medication: { name: "Y", strength: "5mg", unit: "tablet" },
      quantityPerServing: 1,
      directions: "daily",
      prn: false,
    });
    expect(() =>
      logResidentMedicationPrnDispensed(db, adminActor, home.id, r.id, m.id),
    ).toThrow(ValidationError);
  });

  it("32b: admin can post delivery and audit_correction stock events", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const m = createResidentMedication(db, adminActor, home.id, r.id, {
      medication: { name: "Z", strength: "10", unit: "ml" },
      quantityPerServing: 5,
      directions: "daily",
      initialStock: 10,
    });
    adjustResidentMedicationStock(db, adminActor, home.id, r.id, m.id, {
      eventType: "delivery",
      amount: 3,
    });
    let snap = listResidentClinical(db, adminActor, home.id, r.id);
    expect(snap.medications.find((x) => x.id === m.id)?.currentStock).toBe(13);

    adjustResidentMedicationStock(db, adminActor, home.id, r.id, m.id, {
      eventType: "audit_correction",
      amount: -2,
    });
    snap = listResidentClinical(db, adminActor, home.id, r.id);
    expect(snap.medications.find((x) => x.id === m.id)?.currentStock).toBe(11);
  });

  it("32b: Care can log PRN dispense but cannot adjust stock", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
    });
    const care = await createUser(db, "admin", {
      email: "care-prn-stock@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const actor = { userId: care.id, role: "care" as const };
    const m = createResidentMedication(db, adminActor, home.id, r.id, {
      medication: { name: "PRNmed", strength: "1", unit: "u" },
      quantityPerServing: 1,
      directions: "as needed",
      prn: true,
      initialStock: 5,
    });
    const afterPrn = logResidentMedicationPrnDispensed(
      db,
      actor,
      home.id,
      r.id,
      m.id,
    );
    expect(afterPrn.currentStock).toBe(4);
    expect(() =>
      adjustResidentMedicationStock(db, actor, home.id, r.id, m.id, {
        eventType: "delivery",
        amount: 1,
      }),
    ).toThrow(ForbiddenError);
  });
});
