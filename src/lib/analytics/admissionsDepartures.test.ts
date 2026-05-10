import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { users } from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { createResident, departResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import {
  countAdmissionsInMonth,
  countDeparturesInMonth,
  formatStayDurationFromDays,
  getAdmissionsDeparturesKpis,
  listTwelveMonthAdmissionsDepartures,
  stayDaysBetweenAdmissionAndDeparture,
  utcMonthRangeExclusiveEnd,
} from "./admissionsDepartures";
import { shiftBillingMonth } from "@/lib/billing/billingMonth";

const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

function seedUser(db: ReturnType<typeof getDb>, id: string) {
  db.insert(users)
    .values({
      id,
      email: `${id}@test.local`,
      passwordHash: "test",
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: Date.now(),
    })
    .run();
}

describe("admissionsDepartures analytics", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `v60-adm-${randomUUID()}.sqlite`);
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

  it("counts admissions whose admission_date falls in the UTC calendar month", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "W1" });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "April One",
      dob: "1940-01-01",
      admissionDate: "2026-04-03",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "April Two",
      dob: "1940-01-02",
      admissionDate: "2026-04-28",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "March One",
      dob: "1940-03-03",
      admissionDate: "2026-03-31",
    });
    expect(countAdmissionsInMonth(db, "2026-04")).toBe(2);
    expect(countAdmissionsInMonth(db, "2026-03")).toBe(1);
    expect(countAdmissionsInMonth(db, "2026-05")).toBe(0);
  });

  it("counts departures by departed_at_utc_ms in the UTC calendar month", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "W1" });
    const uid = randomUUID();
    seedUser(db, uid);
    const a = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "A",
      dob: "1940-01-01",
      admissionDate: "2025-06-01",
    });
    const b = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "B",
      dob: "1940-01-02",
      admissionDate: "2025-06-02",
    });
    departResident(db, adminActor, home.id, a.id, {
      reason: "Transfer",
      departedAtUtcMs: Date.UTC(2026, 3, 1, 12, 0, 0),
    });
    departResident(db, adminActor, home.id, b.id, {
      reason: "Medical",
      departedAtUtcMs: Date.UTC(2026, 3, 30, 23, 59, 59),
    });
    expect(countDeparturesInMonth(db, "2026-04")).toBe(2);
    expect(countDeparturesInMonth(db, "2026-03")).toBe(0);
  });

  it("exposes KPIs with month-on-month deltas for admissions and departures", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "W1" });
    const uid = randomUUID();
    seedUser(db, uid);
    const p = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Prev",
      dob: "1940-01-01",
      admissionDate: "2026-03-15",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Cur1",
      dob: "1940-01-02",
      admissionDate: "2026-04-02",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Cur2",
      dob: "1940-02-02",
      admissionDate: "2026-04-20",
    });
    departResident(db, adminActor, home.id, p.id, {
      reason: "X",
      departedAtUtcMs: Date.UTC(2026, 2, 20, 0, 0, 0),
    });
    const c1 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "D1",
      dob: "1940-03-03",
      admissionDate: "2026-01-01",
    });
    departResident(db, adminActor, home.id, c1.id, {
      reason: "Y",
      departedAtUtcMs: Date.UTC(2026, 3, 5, 0, 0, 0),
    });
    const at = Date.UTC(2026, 3, 15);
    const k = getAdmissionsDeparturesKpis(db, at);
    expect(k.monthCurrent).toBe("2026-04");
    expect(k.admissionsThisMonth).toBe(2);
    expect(k.admissionsPrevMonth).toBe(1);
    expect(k.admissionsMomDelta).toBe(1);
    expect(k.admissionsMomDeltaPercent).toBe(100);
    expect(k.departuresThisMonth).toBe(1);
    expect(k.departuresPrevMonth).toBe(1);
    expect(k.departuresMomDelta).toBe(0);
    expect(k.departuresMomDeltaPercent).toBe(0);
  });

  it("median length of stay uses only departed residents (all time)", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "W1" });
    const uid = randomUUID();
    seedUser(db, uid);
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Still here",
      dob: "1940-01-01",
      admissionDate: "2020-01-01",
    });
    const a = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "A",
      dob: "1940-02-01",
      admissionDate: "2026-01-01",
    });
    const b = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "B",
      dob: "1940-02-02",
      admissionDate: "2026-01-10",
    });
    const c = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "C",
      dob: "1940-02-03",
      admissionDate: "2026-01-20",
    });
    departResident(db, adminActor, home.id, a.id, {
      reason: "r",
      departedAtUtcMs: Date.UTC(2026, 0, 11, 0, 0, 0),
    });
    departResident(db, adminActor, home.id, b.id, {
      reason: "r",
      departedAtUtcMs: Date.UTC(2026, 0, 25, 0, 0, 0),
    });
    departResident(db, adminActor, home.id, c.id, {
      reason: "r",
      departedAtUtcMs: Date.UTC(2026, 1, 4, 0, 0, 0),
    });
    const k = getAdmissionsDeparturesKpis(db, Date.UTC(2026, 3, 1));
    expect(k.avgLengthOfStayMedianDays).toBe(15);
  });

  it("fills twelve-month series with zeros for months without activity", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "W1" });
    const uid = randomUUID();
    seedUser(db, uid);
    const gapMonth = shiftBillingMonth("2026-04", -5);
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Admit",
      dob: "1940-01-01",
      admissionDate: `${gapMonth}-10`,
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Dep",
      dob: "1940-02-01",
      admissionDate: "2025-01-01",
    });
    departResident(db, adminActor, home.id, r.id, {
      reason: "Z",
      departedAtUtcMs: Date.UTC(
        Number(gapMonth.slice(0, 4)),
        Number(gapMonth.slice(5, 7)) - 1,
        15,
        0,
        0,
        0,
      ),
    });
    const at = Date.UTC(2026, 3, 1);
    const series = listTwelveMonthAdmissionsDepartures(db, at);
    expect(series).toHaveLength(12);
    const silent = series.find((x) => x.monthKey === shiftBillingMonth("2026-04", -2));
    expect(silent?.admissions).toBe(0);
    expect(silent?.departures).toBe(0);
    const hit = series.find((x) => x.monthKey === gapMonth);
    expect(hit?.admissions).toBe(1);
    expect(hit?.departures).toBe(1);
  });

  it("computes stay days and formats duration strings", () => {
    expect(
      stayDaysBetweenAdmissionAndDeparture(
        "2026-01-01",
        Date.UTC(2026, 0, 1, 20, 0, 0),
      ),
    ).toBe(0);
    expect(
      stayDaysBetweenAdmissionAndDeparture(
        "2026-01-01",
        Date.UTC(2026, 0, 5, 0, 0, 0),
      ),
    ).toBe(4);
    expect(formatStayDurationFromDays(5)).toBe("5 days");
    expect(formatStayDurationFromDays(30)).toBe("1 month");
    expect(formatStayDurationFromDays(45)).toBe("1 month 15 days");
  });

  it("exposes UTC month range boundaries", () => {
    const r = utcMonthRangeExclusiveEnd("2026-04");
    expect(r.startMs).toBe(Date.UTC(2026, 3, 1));
    expect(r.endExclusiveMs).toBe(Date.UTC(2026, 4, 1));
  });
});
