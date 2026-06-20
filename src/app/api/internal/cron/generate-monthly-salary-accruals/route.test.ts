import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { count } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { homes, salaryAccruals, users } from "@/db/schema";
import { createStaffSalary } from "@/lib/salaries/service";
import { POST } from "./route";
import { pushTestSchema } from "@/test/pushTestSchema";

const adminActor = { userId: "admin-actor", role: "admin" as const };

function countAccruals(): number {
  const row = getDb().select({ c: count() }).from(salaryAccruals).get();
  return Number(row?.c ?? 0);
}

describe("POST /api/internal/cron/generate-monthly-salary-accruals", () => {
  let dbPath: string;
  let homeId: string;
  const cronSecret = "test-cron-secret-for-vitest";

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-salary-cron-route-${randomUUID()}.sqlite`,
    );
    process.env.DATABASE_PATH = dbPath;
    process.env.CRON_SECRET = cronSecret;
    closeDbConnection();
    pushTestSchema(dbPath);

    const db = getDb();
    const now = Date.now();
    homeId = randomUUID();
    db.insert(homes)
      .values({
        id: homeId,
        name: "Cron Salary Home",
        defaultCurrencyCode: "NZD",
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    db.insert(users)
      .values({
        id: adminActor.userId,
        email: "admin@village.test",
        passwordHash: "hash",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        createdAtUtcMs: now,
        preferredLocale: "en",
      })
      .run();
    createStaffSalary(db, adminActor, {
      homeId,
      fullName: "Cron Staff",
      roleTitle: "Nurse",
      monthlySalaryMinor: 250000,
      effectiveFrom: "2026-01-01",
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
      new Request(
        "http://localhost/api/internal/cron/generate-monthly-salary-accruals",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ billingMonth: "2026-03" }),
        },
      ),
    );
    expect(res.status).toBe(401);
    closeDbConnection();
    expect(countAccruals()).toBe(0);
  });

  it("returns 401 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    process.env.DATABASE_PATH = dbPath;
    const res = await POST(
      new Request(
        "http://localhost/api/internal/cron/generate-monthly-salary-accruals",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ billingMonth: "2026-03" }),
        },
      ),
    );
    expect(res.status).toBe(401);
  });

  it("accrues salaries for all homes when bearer token matches CRON_SECRET", async () => {
    process.env.DATABASE_PATH = dbPath;
    const res = await POST(
      new Request(
        "http://localhost/api/internal/cron/generate-monthly-salary-accruals",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ billingMonth: "2026-03" }),
        },
      ),
    );
    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).toMatchObject({
      generate: {
        billingMonth: "2026-03",
        homes: [{ homeId, created: 1, skipped: [] }],
      },
    });
    closeDbConnection();
    expect(countAccruals()).toBe(1);
  });

  it("defaults billingMonth to previous calendar month when body is empty", async () => {
    process.env.DATABASE_PATH = dbPath;
    const res = await POST(
      new Request(
        "http://localhost/api/internal/cron/generate-monthly-salary-accruals",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            "Content-Type": "application/json",
          },
          body: "",
        },
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      generate: { billingMonth: string; homes: unknown[] };
    };
    expect(json.generate.billingMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(json.generate.homes.length).toBeGreaterThan(0);
  });
});
