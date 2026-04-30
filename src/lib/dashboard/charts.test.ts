import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { createHome, updateHome } from "@/lib/homes/service";
import {
  createResident,
  departResident,
  updateResident,
} from "@/lib/residents/service";
import { createWard, updateWard } from "@/lib/wards/service";
import {
  listDashboardHomeOptions,
  listMonthEndCensusChart,
  listResidentsPerHomeChart,
  overallOccupancyPercent,
  sumConfiguredBedsAllActiveSites,
} from "./charts";

const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("dashboard chart data", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-dashboard-${randomUUID()}.sqlite`);
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

  it("lists non-archived homes in name order with active resident counts and zeros", () => {
    const db = getDb();
    const beta = createHome(db, "admin", {
      name: "Beta House",
      defaultCurrencyCode: "NZD",
    });
    const alpha = createHome(db, "admin", {
      name: "Alpha House",
      defaultCurrencyCode: "NZD",
    });
    const gamma = createHome(db, "admin", {
      name: "Gamma House",
      defaultCurrencyCode: "NZD",
    });

    createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Active Alpha",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const departedAlpha = createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Departed Alpha",
      dob: "1941-01-01",
      admissionDate: "2024-01-02",
    });
    createResident(db, adminActor, {
      homeId: gamma.id,
      fullName: "Archived Home Resident",
      dob: "1942-01-01",
      admissionDate: "2024-01-03",
    });

    departResident(db, adminActor, alpha.id, departedAlpha.id, {
      reason: "Transfer",
      departedAtUtcMs: 1,
    });
    updateHome(db, "admin", gamma.id, { archived: true });

    expect(listResidentsPerHomeChart(db)).toEqual([
      { homeId: alpha.id, homeName: "Alpha House", residentCount: 1 },
      { homeId: beta.id, homeName: "Beta House", residentCount: 0 },
    ]);
  });

  it("counts residents active at month end using admission and departure boundaries", () => {
    const db = getDb();
    const alpha = createHome(db, "admin", {
      name: "Alpha House",
      defaultCurrencyCode: "NZD",
    });
    const beta = createHome(db, "admin", {
      name: "Beta House",
      defaultCurrencyCode: "NZD",
    });

    createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Always Present",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Admitted Last Day",
      dob: "1940-01-02",
      admissionDate: "2024-01-31",
    });
    const departedLastDay = createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Departed Last Day",
      dob: "1940-01-03",
      admissionDate: "2024-01-01",
    });
    const departedAfterMonthEnd = createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Departed After Month End",
      dob: "1940-01-04",
      admissionDate: "2024-01-01",
    });
    createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Future Admission",
      dob: "1940-01-05",
      admissionDate: "2024-02-01",
    });
    createResident(db, adminActor, {
      homeId: beta.id,
      fullName: "Beta Resident",
      dob: "1940-01-06",
      admissionDate: "2024-01-15",
    });

    departResident(db, adminActor, alpha.id, departedLastDay.id, {
      reason: "Transfer",
      departedAtUtcMs: Date.parse("2024-01-31T12:00:00.000Z"),
    });
    departResident(db, adminActor, alpha.id, departedAfterMonthEnd.id, {
      reason: "Transfer",
      departedAtUtcMs: Date.parse("2024-02-01T00:00:00.000Z"),
    });

    expect(
      listMonthEndCensusChart(db, {
        nowUtcMs: Date.parse("2024-01-20T00:00:00.000Z"),
        timeZone: "UTC",
      }),
    ).toMatchObject([
      {
        monthKey: "2024-01",
        homeCounts: [
          { homeId: alpha.id, homeName: "Alpha House", residentCount: 3 },
          { homeId: beta.id, homeName: "Beta House", residentCount: 1 },
        ],
      },
    ]);
  });

  it("uses the configured timezone for month-end departure boundaries", () => {
    const db = getDb();
    const alpha = createHome(db, "admin", {
      name: "Alpha House",
      defaultCurrencyCode: "NZD",
    });

    createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Admitted On Auckland Month End",
      dob: "1941-01-01",
      admissionDate: "2024-01-31",
    });
    const departedOnLastLocalDay = createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Departed Before Auckland Month End",
      dob: "1941-01-02",
      admissionDate: "2024-01-01",
    });
    const departedJustAfterMonthEnd = createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "Departed After Auckland Month End",
      dob: "1941-01-03",
      admissionDate: "2024-01-01",
    });

    departResident(db, adminActor, alpha.id, departedOnLastLocalDay.id, {
      reason: "Transfer",
      departedAtUtcMs: Date.parse("2024-01-31T05:00:00.000Z"),
    });
    departResident(db, adminActor, alpha.id, departedJustAfterMonthEnd.id, {
      reason: "Transfer",
      departedAtUtcMs: Date.parse("2024-01-31T11:00:00.000Z"),
    });

    expect(
      listMonthEndCensusChart(db, {
        nowUtcMs: Date.parse("2024-01-20T00:00:00.000Z"),
        timeZone: "Pacific/Auckland",
      }),
    ).toMatchObject([
      {
        monthKey: "2024-01",
        homeCounts: [
          { homeId: alpha.id, homeName: "Alpha House", residentCount: 2 },
        ],
      },
    ]);
  });

  it("returns YTD months only and zero-fills homes with no census residents", () => {
    const db = getDb();
    const alpha = createHome(db, "admin", {
      name: "Alpha House",
      defaultCurrencyCode: "NZD",
    });
    const beta = createHome(db, "admin", {
      name: "Beta House",
      defaultCurrencyCode: "NZD",
    });

    createResident(db, adminActor, {
      homeId: alpha.id,
      fullName: "March Arrival",
      dob: "1942-01-01",
      admissionDate: "2024-03-01",
    });

    expect(
      listMonthEndCensusChart(db, {
        nowUtcMs: Date.parse("2024-03-15T00:00:00.000Z"),
        timeZone: "UTC",
      }),
    ).toMatchObject([
      {
        monthKey: "2024-01",
        homeCounts: [
          { homeId: alpha.id, homeName: "Alpha House", residentCount: 0 },
          { homeId: beta.id, homeName: "Beta House", residentCount: 0 },
        ],
      },
      {
        monthKey: "2024-02",
        homeCounts: [
          { homeId: alpha.id, homeName: "Alpha House", residentCount: 0 },
          { homeId: beta.id, homeName: "Beta House", residentCount: 0 },
        ],
      },
      {
        monthKey: "2024-03",
        homeCounts: [
          { homeId: alpha.id, homeName: "Alpha House", residentCount: 1 },
          { homeId: beta.id, homeName: "Beta House", residentCount: 0 },
        ],
      },
    ]);
  });

  it("lists non-archived homes A–Z for the dashboard home picker", () => {
    const db = getDb();
    createHome(db, "admin", {
      name: "Zeta House",
      defaultCurrencyCode: "NZD",
    });
    const alpha = createHome(db, "admin", {
      name: "Alpha House",
      defaultCurrencyCode: "NZD",
    });
    createHome(db, "admin", {
      name: "Beta House",
      defaultCurrencyCode: "NZD",
    });
    updateHome(db, "admin", alpha.id, { archived: true });

    expect(listDashboardHomeOptions(db).map((h) => h.homeName)).toEqual([
      "Beta House",
      "Zeta House",
    ]);
  });

  it("sums configured beds for non-archived wards in non-archived homes only", () => {
    const db = getDb();
    const keep = createHome(db, "admin", {
      name: "Keep House",
      defaultCurrencyCode: "NZD",
    });
    const archivedHome = createHome(db, "admin", {
      name: "Gone House",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, keep.id, {
      label: "A",
      sortOrder: 1,
      bedCount: 10,
    });
    createWard(db, adminActor, keep.id, {
      label: "No count",
      sortOrder: 2,
    });
    const wArchived = createWard(db, adminActor, keep.id, {
      label: "Old",
      sortOrder: 3,
      bedCount: 99,
    });
    createWard(db, adminActor, archivedHome.id, {
      label: "Other site",
      sortOrder: 1,
      bedCount: 50,
    });

    updateWard(db, adminActor, keep.id, wArchived.id, { archived: true });
    updateHome(db, "admin", archivedHome.id, { archived: true });

    expect(sumConfiguredBedsAllActiveSites(db)).toBe(10);
  });

  it("computes overall occupancy percent from active residents and configured beds", () => {
    expect(overallOccupancyPercent(7, 10)).toBe(70);
    expect(overallOccupancyPercent(10, 10)).toBe(100);
    expect(overallOccupancyPercent(11, 10)).toBe(110);
    expect(overallOccupancyPercent(0, 0)).toBeNull();
    expect(overallOccupancyPercent(3, 0)).toBeNull();
  });

});

