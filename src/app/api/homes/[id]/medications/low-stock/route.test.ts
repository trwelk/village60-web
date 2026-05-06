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
import {
  homes,
  medications,
  residentMedications,
  residents,
  users,
} from "@/db/schema";
import { normalizeFullNameForUniqueness } from "@/lib/residents/service";
import { GET } from "./route";

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

function seedResident(
  db: ReturnType<typeof getDb>,
  t: number,
  homeId: string,
  id: string,
  fullName: string,
) {
  db.insert(residents)
    .values({
      id,
      homeId,
      fullName,
      normalizedFullName: normalizeFullNameForUniqueness(fullName),
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
}

describe("/api/homes/[id]/medications/low-stock", () => {
  let dbPath: string;

  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", SESSION_PASSWORD);
    vi.stubEnv("NODE_ENV", "test");
    cookieState.seal = "";
    dbPath = path.join(os.tmpdir(), `v60-ls-api-${randomUUID()}.sqlite`);
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

  it("GET returns residents grouped with below-min lines and suggested qty", async () => {
    const adminId = randomUUID();
    const homeId = randomUUID();
    const r1 = randomUUID();
    const r2 = randomUUID();
    const m1 = randomUUID();
    const m2 = randomUUID();
    const rm1 = randomUUID();
    const rm2 = randomUUID();
    const t = Date.now();
    const db = getDb();
    db.insert(homes)
      .values({
        id: homeId,
        name: "H",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(users)
      .values({
        id: adminId,
        email: `a-${adminId}@example.com`,
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
    seedResident(db, t, homeId, r1, "Alice");
    seedResident(db, t, homeId, r2, "Bob");
    db.insert(medications)
      .values({
        id: m1,
        homeId,
        name: "MedA",
        strength: "1",
        unit: "tab",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(medications)
      .values({
        id: m2,
        homeId,
        name: "MedB",
        strength: "2",
        unit: "mL",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(residentMedications)
      .values({
        id: rm1,
        residentId: r1,
        medicationId: m1,
        quantityPerServing: 1,
        servingsPerDay: 1,
        directions: "d",
        prn: false,
        minimumInStock: 10,
        status: "active",
        currentStock: 3,
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(residentMedications)
      .values({
        id: rm2,
        residentId: r2,
        medicationId: m2,
        quantityPerServing: 1,
        servingsPerDay: 1,
        directions: "d",
        prn: false,
        minimumInStock: 5,
        status: "active",
        currentStock: 1,
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    closeDbConnection();

    cookieState.seal = await sealData(
      { userId: adminId, email: "a@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const res = await GET(
      new Request(`http://localhost/api/homes/${homeId}/medications/low-stock`),
      { params: Promise.resolve({ id: homeId }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      medicationOrderCoverageMonths: number;
      groups: {
        residentId: string;
        residentFullName: string;
        lines: { deficit: number; suggestedOrderQty: number; name: string }[];
      }[];
    };
    expect(body.medicationOrderCoverageMonths).toBeGreaterThanOrEqual(1);
    expect(body.groups).toHaveLength(2);
    const alice = body.groups.find((g) => g.residentId === r1);
    const bob = body.groups.find((g) => g.residentId === r2);
    expect(alice?.lines[0]?.name).toBe("MedA");
    expect(alice?.lines[0]?.deficit).toBeCloseTo(7);
    expect(bob?.lines[0]?.name).toBe("MedB");
    expect(bob?.lines[0]?.deficit).toBeCloseTo(4);
    // Default coverage 3: Alice (10*3 - 3) = 27
    expect(alice?.lines[0]?.suggestedOrderQty).toBe(27);
  });

  it("GET omits active lines that are at or above minimum", async () => {
    const adminId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    const t = Date.now();
    const db = getDb();
    db.insert(homes)
      .values({
        id: homeId,
        name: "H",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(users)
      .values({
        id: adminId,
        email: `a-${adminId}@example.com`,
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
    seedResident(db, t, homeId, residentId, "Zed");
    db.insert(medications)
      .values({
        id: medId,
        homeId,
        name: "Ok",
        strength: "1",
        unit: "u",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(residentMedications)
      .values({
        id: resMedId,
        residentId,
        medicationId: medId,
        quantityPerServing: 1,
        servingsPerDay: 1,
        directions: "d",
        prn: false,
        minimumInStock: 10,
        status: "active",
        currentStock: 100,
        sortOrder: 0,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    closeDbConnection();

    cookieState.seal = await sealData(
      { userId: adminId, email: "a@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const res = await GET(
      new Request(`http://localhost/api/homes/${homeId}/medications/low-stock`),
      { params: Promise.resolve({ id: homeId }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: unknown[] };
    expect(body.groups).toHaveLength(0);
  });
});
