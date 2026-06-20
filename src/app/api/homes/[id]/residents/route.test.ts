import { randomUUID } from "node:crypto";
import { pushTestSchema } from "@/test/pushTestSchema";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sealData } from "iron-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { createHome } from "@/lib/homes/service";
import { getResident } from "@/lib/residents/service";
import { createUser } from "@/lib/users/service";
import { createWard } from "@/lib/wards/service";
import { POST } from "./route";

const SESSION_PASSWORD = "a".repeat(32);
const SESSION_TTL = 30 * 60;
const STRONG = "ChangeMeNow!1";

const cookieState = vi.hoisted(() => ({ seal: "" as string }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "village60_session" && cookieState.seal
        ? { name, value: cookieState.seal }
        : undefined,
  }),
}));

describe("home residents API", () => {
  let dbPath: string;

  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", SESSION_PASSWORD);
    vi.stubEnv("NODE_ENV", "test");
    cookieState.seal = "";
    dbPath = path.join(os.tmpdir(), `village60-home-res-api-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    pushTestSchema(dbPath);
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

  it("accepts optional create-time NOK/POA and nurse fields", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const admin = await createUser(db, "admin", {
      email: "resident-api-admin@example.com",
      password: STRONG,
      role: "admin",
    });
    const nurse = await createUser(db, "admin", {
      email: "resident-api-nurse@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const ward = createWard(
      db,
      { userId: admin.id, role: "admin" },
      home.id,
      { label: "North" },
    );
    cookieState.seal = await sealData(
      { userId: admin.id, email: admin.email, role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const res = await POST(
      new Request("http://local/api/homes/x/residents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "Wizard Person",
          dob: "1950-01-01",
          admissionDate: "2026-04-30",
          wardId: ward.id,
          nokName: "Nora",
          nokContact: "021 123",
          nokRelationship: "Daughter",
          poaSameAsNok: false,
          poaName: "Paul",
          poaContact: "09 222",
          poaRelationship: "Lawyer",
          assignedNurseUserId: nurse.id,
          assignedNurseDisplayOverride: "Agency Team",
          otherCharges: {
            registration: { amountMinor: 0, received: false },
            deposit: { amountMinor: 0, received: false },
          },
        }),
      }),
      { params: Promise.resolve({ id: home.id }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { resident: { id: string } };
    const row = getResident(db, { userId: admin.id, role: "admin" }, home.id, json.resident.id);
    expect(row.nokName).toBe("Nora");
    expect(row.poaName).toBe("Paul");
    expect(row.assignedNurseUserId).toBe(nurse.id);
    expect(row.assignedNurseDisplayOverride).toBe("Agency Team");
  });
});
