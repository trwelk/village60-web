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
import { GET, POST } from "./route";

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

describe("/api/homes/[id]/medications/orders", () => {
  let dbPath: string;

  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", SESSION_PASSWORD);
    vi.stubEnv("NODE_ENV", "test");
    cookieState.seal = "";
    dbPath = path.join(os.tmpdir(), `v60-mo-api-${randomUUID()}.sqlite`);
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

  function seedFull(opts: {
    adminId: string;
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
        name: "H",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(users)
      .values({
        id: opts.adminId,
        email: `a-${opts.adminId}@example.com`,
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
    db.insert(residents)
      .values({
        id: opts.residentId,
        homeId: opts.homeId,
        fullName: "R",
        normalizedFullName: normalizeFullNameForUniqueness("R"),
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
        name: "M",
        strength: "1",
        unit: "u",
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
        directions: "d",
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

  it("POST create-or-merge returns order with lines; GET lists it", async () => {
    const adminId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedFull({
      adminId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 25,
    });
    cookieState.seal = await sealData(
      { userId: adminId, email: "a@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const postRes = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentId }),
      }),
      { params: Promise.resolve({ id: homeId }) },
    );
    expect(postRes.status).toBe(200);
    const created = (await postRes.json()) as {
      order: { id: string; status: string };
      lines: { orderedQty: number }[];
    };
    expect(created.order.status).toBe("pending");
    expect(created.lines[0]!.orderedQty).toBe(5);

    const getRes = await GET(
      new Request(`http://localhost/api/homes/${homeId}/medications/orders`),
      { params: Promise.resolve({ id: homeId }) },
    );
    expect(getRes.status).toBe(200);
    const listBody = (await getRes.json()) as {
      orders: { id: string; residentId: string }[];
    };
    expect(listBody.orders.some((o) => o.id === created.order.id)).toBe(true);
  });

  it("POST returns 409 when nothing to order", async () => {
    const adminId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const medId = randomUUID();
    const resMedId = randomUUID();
    seedFull({
      adminId,
      homeId,
      residentId,
      medId,
      resMedId,
      minimumInStock: 10,
      currentStock: 100,
    });
    cookieState.seal = await sealData(
      { userId: adminId, email: "a@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const postRes = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentId }),
      }),
      { params: Promise.resolve({ id: homeId }) },
    );
    expect(postRes.status).toBe(409);
    const errBody = (await postRes.json()) as { error: string };
    expect(errBody.error).toMatch(/nothing to order/i);
  });
});
