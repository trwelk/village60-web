import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sealData } from "iron-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { homes, users } from "@/db/schema";
import { GET, PATCH } from "./route";

const SESSION_PASSWORD = "c".repeat(32);
const SESSION_TTL = 30 * 60;

const cookieState = vi.hoisted(() => ({ seal: "" as string }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "village60_session" && cookieState.seal
        ? { name, value: cookieState.seal }
        : undefined,
  }),
}));

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("GET/PATCH /api/admin/settings/medication-order-coverage", () => {
  let dbPath: string;

  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", SESSION_PASSWORD);
    vi.stubEnv("NODE_ENV", "test");
    cookieState.seal = "";
    dbPath = path.join(os.tmpdir(), `v60-med-cov-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    vi.unstubAllEnvs();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  function seedAdmin(adminId: string) {
    const db = getDb();
    const t = Date.now();
    db.insert(users)
      .values({
        id: adminId,
        email: `admin-med-cov-${adminId}@example.com`,
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
    closeDbConnection();
  }

  function seedCare(careId: string) {
    const db = getDb();
    const t = Date.now();
    db.insert(homes)
      .values({
        id: "h1",
        name: "Home One",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(users)
      .values({
        id: careId,
        email: `care-med-cov-${careId}@example.com`,
        passwordHash: "x",
        role: "care",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: "h1",
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    closeDbConnection();
  }

  it("returns default coverage months for admin when unset", async () => {
    const adminId = randomUUID();
    seedAdmin(adminId);
    cookieState.seal = await sealData(
      { userId: adminId, email: "a@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { medicationOrderCoverageMonths: number };
    expect(body.medicationOrderCoverageMonths).toBe(3);
  });

  it("returns 403 for care user on GET", async () => {
    const careId = randomUUID();
    seedCare(careId);
    cookieState.seal = await sealData(
      { userId: careId, email: "c@example.com", role: "care" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("PATCH persists value and GET returns it", async () => {
    const adminId = randomUUID();
    seedAdmin(adminId);
    cookieState.seal = await sealData(
      { userId: adminId, email: "a@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const patchRes = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicationOrderCoverageMonths: 6 }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patchBody = (await patchRes.json()) as {
      medicationOrderCoverageMonths: number;
    };
    expect(patchBody.medicationOrderCoverageMonths).toBe(6);

    const getRes = await GET();
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      medicationOrderCoverageMonths: number;
    };
    expect(getBody.medicationOrderCoverageMonths).toBe(6);
  });

  it("returns 400 for out-of-range PATCH", async () => {
    const adminId = randomUUID();
    seedAdmin(adminId);
    cookieState.seal = await sealData(
      { userId: adminId, email: "a@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicationOrderCoverageMonths: 0 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for care user on PATCH", async () => {
    const careId = randomUUID();
    seedCare(careId);
    cookieState.seal = await sealData(
      { userId: careId, email: "c@example.com", role: "care" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicationOrderCoverageMonths: 2 }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
