import { randomUUID } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { billingTransactions, salaryAccruals } from "@/db/schema";
import { calendarDateIsoToUtcMs } from "@/lib/billing/receivedOnUtcMs";
import { openTestMemoryDb } from "@/test/pushTestSchema";
import {
  generateMonthlySalaryAccruals,
  voidSalaryAccrual,
} from "./accruals";
import { SALARY_ACCRUAL_SOURCE_KIND } from "./ledger";
import { createStaffSalary } from "./service";

function seedHome(db: ReturnType<typeof openTestMemoryDb>["db"]) {
  const homeId = randomUUID();
  const now = Date.now();
  db.insert(schema.homes)
    .values({
      id: homeId,
      name: "Test Home",
      defaultCurrencyCode: "INR",
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  return homeId;
}

function seedAdminUser(db: ReturnType<typeof openTestMemoryDb>["db"], userId = "admin-1") {
  const now = Date.now();
  db.insert(schema.users)
    .values({
      id: userId,
      email: "admin@village.test",
      passwordHash: "hash",
      role: "admin",
      failureTimestampsUtcMs: "[]",
      createdAtUtcMs: now,
      preferredLocale: "en",
    })
    .run();
  return userId;
}

describe("generateMonthlySalaryAccruals", () => {
  let db: ReturnType<typeof openTestMemoryDb>["db"];
  let sqlite: Database.Database;
  let homeId: string;
  const adminActor = { userId: "admin-1", role: "admin" as const };

  beforeEach(() => {
    const opened = openTestMemoryDb();
    db = opened.db;
    sqlite = opened.sqlite;
    homeId = seedHome(db);
    seedAdminUser(db);
    createStaffSalary(db, adminActor, {
      homeId,
      fullName: "Active One",
      roleTitle: "Nurse",
      monthlySalaryMinor: 2000000,
      effectiveFrom: "2026-01-01",
    });
    createStaffSalary(db, adminActor, {
      homeId,
      fullName: "Active Two",
      roleTitle: "Kitchen Staff",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
    });
    const inactive = createStaffSalary(db, adminActor, {
      homeId,
      fullName: "Inactive Staff",
      roleTitle: "Care taker",
      monthlySalaryMinor: 1800000,
      effectiveFrom: "2026-01-01",
    });
    db.update(schema.staffSalaries)
      .set({ status: "inactive" })
      .where(eq(schema.staffSalaries.id, inactive.id))
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("creates one charge per active staff for the billing month", () => {
    const result = generateMonthlySalaryAccruals(db, adminActor, {
      homeId,
      billingMonth: "2026-03",
    });
    expect(result.created).toBe(2);
    expect(result.skipped).toHaveLength(0);

    const accruals = db.select().from(salaryAccruals).all();
    expect(accruals).toHaveLength(2);
    expect(accruals.every((a) => a.status === "accrued")).toBe(true);

    const charges = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.sourceKind, SALARY_ACCRUAL_SOURCE_KIND))
      .all();
    expect(charges).toHaveLength(2);
    expect(charges.every((c) => c.txnType === "charge")).toBe(true);
    expect(charges.every((c) => c.amountMinor > 0)).toBe(true);
  });

  it("is idempotent on second run", () => {
    generateMonthlySalaryAccruals(db, adminActor, {
      homeId,
      billingMonth: "2026-03",
    });
    const second = generateMonthlySalaryAccruals(db, adminActor, {
      homeId,
      billingMonth: "2026-03",
    });
    expect(second.created).toBe(0);
    expect(second.skipped).toHaveLength(2);
    expect(db.select().from(salaryAccruals).all()).toHaveLength(2);
  });

  it("sets accruedOn to last day of billing month", () => {
    generateMonthlySalaryAccruals(db, adminActor, {
      homeId,
      billingMonth: "2026-02",
    });
    const accrual = db.select().from(salaryAccruals).get();
    expect(accrual?.accruedOn).toBe("2026-02-28");
    const charge = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.id, accrual!.chargeLedgerTransactionId))
      .get();
    expect(charge?.postedAtUtcMs).toBe(calendarDateIsoToUtcMs("2026-02-28"));
  });
});

describe("voidSalaryAccrual", () => {
  let db: ReturnType<typeof openTestMemoryDb>["db"];
  let sqlite: Database.Database;
  let homeId: string;
  const adminActor = { userId: "admin-1", role: "admin" as const };

  beforeEach(() => {
    const opened = openTestMemoryDb();
    db = opened.db;
    sqlite = opened.sqlite;
    homeId = seedHome(db);
    seedAdminUser(db);
    createStaffSalary(db, adminActor, {
      homeId,
      fullName: "Ravi Kumar",
      roleTitle: "Kitchen Staff",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
    });
    generateMonthlySalaryAccruals(db, adminActor, {
      homeId,
      billingMonth: "2026-03",
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("voids accrued accrual and removes charge", () => {
    const accrual = db.select().from(salaryAccruals).get()!;
    voidSalaryAccrual(db, adminActor, homeId, accrual.id);

    const updated = db
      .select()
      .from(salaryAccruals)
      .where(eq(salaryAccruals.id, accrual.id))
      .get();
    expect(updated).toBeUndefined();

    const charge = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.id, accrual.chargeLedgerTransactionId))
      .get();
    expect(charge).toBeUndefined();
  });
});
