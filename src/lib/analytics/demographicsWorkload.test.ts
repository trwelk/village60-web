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
import { homes, users } from "@/db/schema";
import { calculateAge } from "@/lib/residents/age";
import { createHome } from "@/lib/homes/service";
import {
  createResident,
  updateResident,
} from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import {
  ageBandIndexForAge,
  computeDemographicsFromDobs,
  getDemographicsAnalytics,
  listResidentsPerCareNurse,
  utcDateStringFromUtcMs,
} from "./demographicsWorkload";

const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

function seedCareUser(
  db: ReturnType<typeof getDb>,
  id: string,
  opts: {
    primaryHomeId: string;
    displayName?: string | null;
  },
) {
  db.insert(users)
    .values({
      id,
      email: `${id}@test.local`,
      passwordHash: "test",
      role: "care",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: Date.now(),
      primaryHomeId: opts.primaryHomeId,
      displayName: opts.displayName ?? null,
    })
    .run();
}

describe("demographicsWorkload analytics", () => {
  describe("ageBandIndexForAge", () => {
    it("maps boundaries between bands correctly", () => {
      expect(ageBandIndexForAge(69)).toBe(0);
      expect(ageBandIndexForAge(70)).toBe(1);
      expect(ageBandIndexForAge(74)).toBe(1);
      expect(ageBandIndexForAge(75)).toBe(2);
      expect(ageBandIndexForAge(89)).toBe(4);
      expect(ageBandIndexForAge(90)).toBe(5);
      expect(ageBandIndexForAge(94)).toBe(5);
      expect(ageBandIndexForAge(95)).toBe(6);
    });
  });

  describe("utcDateStringFromUtcMs", () => {
    it("formats UTC calendar date for histogram age anchor", () => {
      const ms = Date.UTC(2026, 3, 28, 15, 30, 0);
      expect(utcDateStringFromUtcMs(ms)).toBe("2026-04-28");
    });
  });

  describe("computeDemographicsFromDobs", () => {
    it("counts 90+ and builds seven histogram bands from ages (UTC today)", () => {
      const utcToday = "2026-04-28";
      const dobs = [
        "1957-03-01",
        "1945-06-10",
        "1940-01-01",
        "1936-03-01",
        "1935-04-01",
      ];
      const k = computeDemographicsFromDobs(dobs, utcToday);
      expect(k.totalActiveResidents).toBe(5);
      expect(k.residents90PlusCount).toBe(2);
      expect(k.residents90PlusSharePercent).toBe(40);
      expect(k.ageHistogram.map((x) => x.bandLabel)).toEqual([
        "Under 70",
        "70–74",
        "75–79",
        "80–84",
        "85–89",
        "90–94",
        "95 and over",
      ]);
      expect(
        k.ageHistogram.reduce((s, row) => s + row.count, 0),
      ).toBe(k.totalActiveResidents);
      const byLabel = Object.fromEntries(
        k.ageHistogram.map((x) => [x.bandLabel, x.count]),
      );
      expect(byLabel["Under 70"]).toBe(1);
      expect(byLabel["80–84"]).toBe(1);
      expect(byLabel["85–89"]).toBe(1);
      expect(byLabel["90–94"]).toBe(2);
      expect(byLabel["95 and over"]).toBe(0);
      expect(byLabel["70–74"]).toBe(0);
      expect(byLabel["75–79"]).toBe(0);
    });

    it("uses birthday-on-today as completed age (not one year younger)", () => {
      const utcToday = "2026-04-19";
      expect(calculateAge("1955-04-19", utcToday)).toBe(71);
      const k = computeDemographicsFromDobs(["1955-04-19"], utcToday);
      expect(k.ageHistogram[1]?.count).toBe(1);
      expect(k.ageHistogram[0]?.count).toBe(0);
    });

    it("handles leap-day DOB before Feb 29 birthday in a leap year", () => {
      const utcToday = "2024-02-28";
      expect(calculateAge("2000-02-29", utcToday)).toBe(23);
    });

    it("handles leap-day DOB on birthday in a leap year", () => {
      const utcToday = "2024-02-29";
      expect(calculateAge("2000-02-29", utcToday)).toBe(24);
    });

    it("defines leap-day DOB age on Mar 1 in a non-leap year consistently with calculateAge", () => {
      const utcToday = "2025-03-01";
      expect(calculateAge("2000-02-29", utcToday)).toBe(25);
    });
  });

  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `v60-dem-${randomUUID()}.sqlite`);
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

  it("getDemographicsAnalytics ignores archived homes and departed residents", () => {
    const db = getDb();
    const activeHome = createHome(db, "admin", {
      name: "Active",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, activeHome.id, { label: "W" });
    createResident(db, adminActor, {
      homeId: activeHome.id,
      fullName: "Young",
      dob: "1960-01-01",
      admissionDate: "2020-01-01",
    });
    const archived = createHome(db, "admin", {
      name: "Archived",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, archived.id, { label: "W2" });
    db.update(homes)
      .set({ archivedAtUtcMs: Date.now() })
      .where(eq(homes.id, archived.id))
      .run();
    createResident(db, adminActor, {
      homeId: archived.id,
      fullName: "Hidden",
      dob: "1920-01-01",
      admissionDate: "2015-01-01",
    });
    const at = Date.UTC(2026, 5, 15);
    const k = getDemographicsAnalytics(db, at);
    expect(k.totalActiveResidents).toBe(1);
  });

  it("listResidentsPerCareNurse aggregates active assignments per care user, ordered by count desc", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "W1" });
    const nurseA = randomUUID();
    const nurseB = randomUUID();
    seedCareUser(db, nurseA, {
      primaryHomeId: home.id,
      displayName: "Nurse A",
    });
    seedCareUser(db, nurseB, {
      primaryHomeId: home.id,
      displayName: null,
    });
    const r1 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "R1",
      dob: "1940-01-01",
      admissionDate: "2020-01-01",
    });
    const r2 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "R2",
      dob: "1941-01-01",
      admissionDate: "2020-01-02",
    });
    const r3 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "R3",
      dob: "1942-01-01",
      admissionDate: "2020-01-03",
    });
    updateResident(db, adminActor, home.id, r1.id, {
      assignedNurseUserId: nurseB,
    });
    updateResident(db, adminActor, home.id, r2.id, {
      assignedNurseUserId: nurseA,
    });
    updateResident(db, adminActor, home.id, r3.id, {
      assignedNurseUserId: nurseA,
    });
    const rows = listResidentsPerCareNurse(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.residentCount).toBe(2);
    expect(rows[0]?.label).toBe("Nurse A");
    expect(rows[1]?.residentCount).toBe(1);
    expect(rows[1]?.label).toBe(`${nurseB}@test.local`);
  });

  it("listResidentsPerCareNurse returns empty when no active assignments to care users", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "W1" });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Unassigned",
      dob: "1940-01-01",
      admissionDate: "2020-01-01",
    });
    expect(listResidentsPerCareNurse(db)).toEqual([]);
  });
});
