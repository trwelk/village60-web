import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { createHome } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { createUser } from "@/lib/users/service";
import {
  createResident,
} from "./service";
import {
  createResidentAllergy,
  createResidentCondition,
  createResidentMedication,
  deleteResidentAllergy,
  deleteResidentCondition,
  deleteResidentMedication,
  listResidentClinical,
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

  it("manages medications including PRN and timing notes", () => {
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
      name: "Paracetamol",
      dose: "500 mg",
      frequency: "QID",
      timingNotes: "  with food ",
      prn: true,
    });
    expect(m.prn).toBe(true);
    expect(m.timingNotes).toBe("with food");

    const m2 = createResidentMedication(db, adminActor, home.id, r.id, {
      name: "Metformin",
      dose: "500 mg",
      frequency: "BD",
      prn: false,
    });
    expect(m2.timingNotes).toBeNull();

    updateResidentMedication(db, adminActor, home.id, r.id, m.id, {
      prn: false,
      timingNotes: "after meals",
    });
    const snap = listResidentClinical(db, adminActor, home.id, r.id);
    const row = snap.medications.find((x) => x.id === m.id);
    expect(row?.prn).toBe(false);
    expect(row?.timingNotes).toBe("after meals");

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
        name: "X",
        dose: "",
        frequency: "daily",
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
});
