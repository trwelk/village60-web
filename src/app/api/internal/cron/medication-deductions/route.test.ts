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
import {
  residentMedications,
  residentMedicationStockEvents,
  users,
} from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { createHomeMedicationCatalogRow } from "@/lib/homeMedications/catalog";
import { createResidentMedication } from "@/lib/residents/clinical";
import { createResident } from "@/lib/residents/service";
import { POST } from "./route";

const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("POST /api/internal/cron/medication-deductions", () => {
  let dbPath: string;
  const cronSecret = "test-cron-secret-med-deduction";

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-med-deduction-cron-${randomUUID()}.sqlite`,
    );
    process.env.DATABASE_PATH = dbPath;
    process.env.CRON_SECRET = cronSecret;
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
    closeDbConnection();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("32c: returns 401 when Authorization is missing", async () => {
    process.env.DATABASE_PATH = dbPath;
    const res = await POST(
      new Request("http://localhost/api/internal/cron/medication-deductions", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("32c: returns 401 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    process.env.DATABASE_PATH = dbPath;
    const res = await POST(
      new Request("http://localhost/api/internal/cron/medication-deductions", {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("32c: deducts quantityPerServing * servingsPerDay for active non-PRN scheduled meds", async () => {
    process.env.DATABASE_PATH = dbPath;
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
      { name: "Metformin", strength: "500mg", unit: "tablet" },
      Date.now(),
    );
    const line = createResidentMedication(db, adminActor, home.id, r.id, {
      medicationId: cat.id,
      quantityPerServing: 2,
      servingsPerDay: 3,
      directions: "with meals",
      initialStock: 100,
    });
    closeDbConnection();

    const res = await POST(
      new Request("http://localhost/api/internal/cron/medication-deductions", {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
      }),
    );
    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).toMatchObject({ processed: 1 });

    process.env.DATABASE_PATH = dbPath;
    const db2 = getDb();
    const med = db2
      .select()
      .from(residentMedications)
      .where(eq(residentMedications.id, line.id))
      .get()!;
    expect(med.currentStock).toBeCloseTo(94, 5);

    const evs = db2
      .select()
      .from(residentMedicationStockEvents)
      .where(eq(residentMedicationStockEvents.residentMedicationId, line.id))
      .all()
      .sort((a, b) => a.createdAtUtcMs - b.createdAtUtcMs);
    expect(evs.length).toBe(2);
    expect(evs[1].eventType).toBe("auto_deduction");
    expect(evs[1].amount).toBeCloseTo(-6, 5);
    expect(evs[1].createdByUserId).toBeNull();
  });

  it("32c: skips PRN, inactive, and unscheduled (null servingsPerDay) lines", async () => {
    process.env.DATABASE_PATH = dbPath;
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
      { name: "PRNMed", strength: "1", unit: "u" },
      Date.now(),
    );
    const b = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Sched", strength: "1", unit: "u" },
      Date.now(),
    );
    const c = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "NoDaily", strength: "1", unit: "u" },
      Date.now(),
    );
    const d = createHomeMedicationCatalogRow(
      db,
      adminActor,
      home.id,
      { name: "Paused", strength: "1", unit: "u" },
      Date.now(),
    );
    createResidentMedication(db, adminActor, home.id, r.id, {
      medicationId: a.id,
      quantityPerServing: 1,
      servingsPerDay: 2,
      directions: "PRN",
      prn: true,
      initialStock: 10,
    });
    const sched = createResidentMedication(db, adminActor, home.id, r.id, {
      medicationId: b.id,
      quantityPerServing: 1,
      servingsPerDay: 1,
      directions: "daily",
      initialStock: 50,
    });
    createResidentMedication(db, adminActor, home.id, r.id, {
      medicationId: c.id,
      quantityPerServing: 5,
      directions: "not daily",
      initialStock: 20,
    });
    const paused = createResidentMedication(db, adminActor, home.id, r.id, {
      medicationId: d.id,
      quantityPerServing: 3,
      servingsPerDay: 2,
      directions: "hold",
      initialStock: 30,
    });
    db.update(residentMedications)
      .set({ status: "paused" })
      .where(eq(residentMedications.id, paused.id))
      .run();
    closeDbConnection();

    const res = await POST(
      new Request("http://localhost/api/internal/cron/medication-deductions", {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
      }),
    );
    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).toMatchObject({ processed: 1 });

    process.env.DATABASE_PATH = dbPath;
    const db2 = getDb();
    const schedRow = db2
      .select()
      .from(residentMedications)
      .where(eq(residentMedications.id, sched.id))
      .get()!;
    expect(schedRow.currentStock).toBeCloseTo(49, 5);
  });

  it("32c: auto deduction may drive stock negative", async () => {
    process.env.DATABASE_PATH = dbPath;
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
      { name: "Low", strength: "1", unit: "u" },
      Date.now(),
    );
    const line = createResidentMedication(db, adminActor, home.id, r.id, {
      medicationId: cat.id,
      quantityPerServing: 2,
      servingsPerDay: 3,
      directions: "daily",
      initialStock: 5,
    });
    closeDbConnection();

    const res = await POST(
      new Request("http://localhost/api/internal/cron/medication-deductions", {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
      }),
    );
    expect(res.status).toBe(200);

    process.env.DATABASE_PATH = dbPath;
    const db2 = getDb();
    const med = db2
      .select()
      .from(residentMedications)
      .where(eq(residentMedications.id, line.id))
      .get()!;
    expect(med.currentStock).toBeCloseTo(-1, 5);
  });
});
