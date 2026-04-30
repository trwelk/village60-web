import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { residentMonthlyCharges } from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import { POST } from "./route";

const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

function countCharges() {
  return getDb().select().from(residentMonthlyCharges).all().length;
}

describe("POST /api/internal/cron/generate-monthly-charges", () => {
  let dbPath: string;
  const cronSecret = "test-cron-secret-for-vitest";

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-cron-route-${randomUUID()}.sqlite`,
    );
    process.env.DATABASE_PATH = dbPath;
    process.env.CRON_SECRET = cronSecret;
    closeDbConnection();
    runMigrations(dbPath);

    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Cron Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 42,
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Cron Resident",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
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

  it("returns 401 and performs no inserts when Authorization is missing", async () => {
    process.env.DATABASE_PATH = dbPath;
    const res = await POST(
      new Request("http://localhost/api/internal/cron/generate-monthly-charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingMonth: "2026-09" }),
      }),
    );
    expect(res.status).toBe(401);
    closeDbConnection();
    const sqlite = new Database(dbPath);
    const n = sqlite
      .prepare("SELECT count(*) AS c FROM resident_monthly_charges")
      .get() as { c: number };
    sqlite.close();
    expect(n.c).toBe(0);
  });

  it("returns 401 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    process.env.DATABASE_PATH = dbPath;
    const res = await POST(
      new Request("http://localhost/api/internal/cron/generate-monthly-charges", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ billingMonth: "2026-10" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("runs generation when bearer token matches CRON_SECRET", async () => {
    process.env.DATABASE_PATH = dbPath;
    const res = await POST(
      new Request("http://localhost/api/internal/cron/generate-monthly-charges", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ billingMonth: "2026-11" }),
      }),
    );
    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).toMatchObject({
      billingMonth: "2026-11",
      created: 1,
      skipped: [],
    });
    expect(countCharges()).toBe(1);
  });
});
