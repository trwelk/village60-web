import { randomUUID } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { salaryAccruals } from "@/db/schema";
import { openTestMemoryDb } from "@/test/pushTestSchema";
import {
  getExpenseAnalyticsSnapshot,
  getFinancialAnalyticsSnapshot,
} from "@/lib/analytics/financialOverview";
import { generateMonthlySalaryAccruals } from "@/lib/salaries/accruals";
import { STAFF_SALARIES_EXPENSE_CATEGORY } from "@/lib/salaries/ledger";
import { createRemittance, createStaffSalary } from "@/lib/salaries/service";

function seedHome(db: ReturnType<typeof openTestMemoryDb>["db"]) {
  const homeId = randomUUID();
  const now = Date.now();
  db.insert(schema.homes)
    .values({
      id: homeId,
      name: "Analytics Home",
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

describe("financialOverview salary accrual analytics", () => {
  let db: ReturnType<typeof openTestMemoryDb>["db"];
  let sqlite: Database.Database;
  let homeId: string;
  let salaryId: string;
  const adminActor = { userId: "admin-1", role: "admin" as const };
  const atUtcMs = Date.UTC(2026, 5, 15);

  beforeEach(() => {
    const opened = openTestMemoryDb();
    db = opened.db;
    sqlite = opened.sqlite;
    homeId = seedHome(db);
    seedAdminUser(db);
    const salary = createStaffSalary(db, adminActor, {
      homeId,
      fullName: "Analytics Staff",
      roleTitle: "Nurse",
      monthlySalaryMinor: 2000000,
      effectiveFrom: "2026-01-01",
    });
    salaryId = salary.id;
    generateMonthlySalaryAccruals(db, adminActor, {
      homeId,
      billingMonth: "2026-03",
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("counts salary cash-out in payment month, not accrual month", () => {
    const beforePay = getFinancialAnalyticsSnapshot(db, {
      atUtcMs,
      preset: "6",
      homeId,
      displayCurrencyCode: "INR",
    });

    const marchFlow = beforePay.monthlyCashFlow.find((m) => m.monthKey === "2026-03");
    expect(marchFlow).toBeDefined();
    expect(marchFlow!.expensesMinor).toBe(0);

    createRemittance(db, adminActor, {
      staffSalaryId: salaryId,
      homeId,
      periodYear: 2026,
      periodMonth: 3,
      amountPaidMinor: 2000000,
      paidOn: "2026-04-10",
    });

    const afterPay = getFinancialAnalyticsSnapshot(db, {
      atUtcMs,
      preset: "6",
      homeId,
      displayCurrencyCode: "INR",
    });

    const marchAfter = afterPay.monthlyCashFlow.find((m) => m.monthKey === "2026-03");
    const aprilAfter = afterPay.monthlyCashFlow.find((m) => m.monthKey === "2026-04");
    expect(marchAfter!.expensesMinor).toBe(0);
    expect(aprilAfter!.expensesMinor).toBe(2000000);
    expect(afterPay.kpis.totalExpensesMinor).toBe(2000000);
  });

  it("includes staff salaries in expense snapshot by payment month", () => {
    createRemittance(db, adminActor, {
      staffSalaryId: salaryId,
      homeId,
      periodYear: 2026,
      periodMonth: 3,
      amountPaidMinor: 2000000,
      paidOn: "2026-04-10",
    });

    const expenses = getExpenseAnalyticsSnapshot(db, {
      atUtcMs,
      preset: "6",
      homeId,
      displayCurrencyCode: "INR",
    });

    expect(expenses.totalExpensesMinor).toBe(2000000);
    const staffRow = expenses.expensesByCategory.find(
      (r) => r.label === STAFF_SALARIES_EXPENSE_CATEGORY,
    );
    expect(staffRow?.amountMinor).toBe(2000000);

    const accrual = db
      .select()
      .from(salaryAccruals)
      .where(eq(salaryAccruals.staffSalaryId, salaryId))
      .get();
    expect(accrual?.status).toBe("paid");
  });
});
