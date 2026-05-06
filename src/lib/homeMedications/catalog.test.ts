import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { residentMedications } from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import {
  createHomeMedicationCatalogRow,
  deleteHomeMedicationCatalogRow,
  listHomeMedicationCatalog,
  updateHomeMedicationCatalogRow,
} from "./catalog";
import { createResident } from "@/lib/residents/service";

const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("home medication catalog (31a)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mcat-${randomUUID()}.sqlite`);
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

  it("starts empty then lists catalog rows after create", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const empty = listHomeMedicationCatalog(db, adminActor, home.id);
    expect(empty).toEqual([]);

    const row = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "  Paracetamol ", strength: " 500 Mg ", unit: " tablet " },
      1,
    );
    expect(row.name).toBe("Paracetamol");
    expect(row.strength).toBe("500 Mg");
    expect(row.unit).toBe("tablet");

    const rows = listHomeMedicationCatalog(db, adminActor, home.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Paracetamol");
  });

  it("rejects duplicate catalog triple for the same home (case / spacing normalization)", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Aspirin", strength: "81mg", unit: "tablet" },
      1,
    );
    expect(() =>
      createHomeMedicationCatalogRow(
        db,
        adminActor,
        home.id,
        { name: "  ASPIRIN ", strength: " 81MG ", unit: " tablet " },
        2,
      ),
    ).toThrow(ValidationError);
  });

  it("allows same triple in different homes", () => {
    const db = getDb();
    const h1 = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const h2 = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const a = createHomeMedicationCatalogRow(
      db,
      adminActor,
      h1.id,
      { name: "Vitamin D", strength: "1000 IU", unit: "tablet" },
      1,
    );
    const b = createHomeMedicationCatalogRow(
      db,
      adminActor,
      h2.id,
      { name: "Vitamin D", strength: "1000 IU", unit: "tablet" },
      2,
    );
    expect(a.homeId).toBe(h1.id);
    expect(b.homeId).toBe(h2.id);
    expect(a.id).not.toBe(b.id);
  });

  it("filters list by substring search parameter q", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Metformin", strength: "500mg", unit: "tablet" },
      1,
    );
    createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Warfarin", strength: "1mg", unit: "tablet" },
      2,
    );
    const found = listHomeMedicationCatalog(db, adminActor, home.id, { q: "met" });
    expect(found.map((r) => r.name)).toEqual(["Metformin"]);
  });

  it("update enforces uniqueness on the normalized triple", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ibu = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Ibuprofen", strength: "200mg", unit: "tablet" },
      1,
    );
    createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Ibuprofen", strength: "400mg", unit: "tablet" },
      2,
    );
    expect(() =>
      updateHomeMedicationCatalogRow(
        db,
        adminActor,
        home.id,
        ibu.id,
        { strength: "400mg" },
        9,
      ),
    ).toThrow(ValidationError);
  });

  it("delete succeeds only when no resident assignment references catalog id", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2025-01-01",
    });
    const med = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Free stock", strength: "1", unit: "ea" },
      1,
    );

    db.insert(residentMedications)
      .values({
        id: randomUUID(),
        residentId: r.id,
        medicationId: med.id,
        quantityPerServing: 1,
        servingsPerDay: 1,
        directions: "Test",
        prn: false,
        minimumInStock: null,
        sortOrder: 0,
        createdAtUtcMs: 10,
        updatedAtUtcMs: 10,
      })
      .run();

    expect(() =>
      deleteHomeMedicationCatalogRow(db, adminActor, home.id, med.id),
    ).toThrow(ValidationError);

    db.delete(residentMedications).where(eq(residentMedications.residentId, r.id)).run();
    deleteHomeMedicationCatalogRow(db, adminActor, home.id, med.id);
    expect(listHomeMedicationCatalog(db, adminActor, home.id)).toEqual([]);
  });

  it("throws when deleting or updating medication for wrong home id", () => {
    const db = getDb();
    const h1 = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const h2 = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const row = createHomeMedicationCatalogRow(
      db,
      adminActor,
      h1.id,
      { name: "Med", strength: "1", unit: "ml" },
      1,
    );
    expect(() =>
      deleteHomeMedicationCatalogRow(db, adminActor, h2.id, row.id),
    ).toThrow(NotFoundError);

    expect(() =>
      updateHomeMedicationCatalogRow(
        db,
        adminActor,
        h2.id,
        row.id,
        { name: "Renamed" },
        99,
      ),
    ).toThrow(NotFoundError);
  });

  it("requires an authenticated actor", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    expect(() =>
      listHomeMedicationCatalog(db, undefined, home.id),
    ).toThrow(ForbiddenError);
  });
});
