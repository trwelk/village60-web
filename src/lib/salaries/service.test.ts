import { randomUUID } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { billingTransactions, salaryAccruals } from "@/db/schema";
import { calendarDateIsoToUtcMs } from "@/lib/billing/receivedOnUtcMs";
import { generateMonthlySalaryAccruals } from "./accruals";
import { formatSalaryPaymentChargeMemo } from "./ledger";
import {
  createRemittance,
  createStaffSalary,
  deleteRemittance,
  listStaffSalariesPaged,
  type CreateStaffSalaryInput,
} from "./service";

function setupTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db, sqlite };
}

function seedHome(db: ReturnType<typeof setupTestDb>["db"]) {
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

function seedAdminUser(db: ReturnType<typeof setupTestDb>["db"], userId = "admin-1") {
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

describe("createStaffSalary", () => {
  let db: ReturnType<typeof setupTestDb>["db"];
  let sqlite: Database.Database;
  let homeId: string;

  beforeEach(() => {
    const opened = setupTestDb();
    db = opened.db;
    sqlite = opened.sqlite;
    homeId = seedHome(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("creates a salary record for non-user staff", () => {
    const input: CreateStaffSalaryInput = {
      homeId,
      fullName: "Ravi Kumar",
      roleTitle: "Kitchen Staff",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
      phone: "9876543210",
    };
    const actor = { userId: "admin-1", role: "admin" as const };
    const result = createStaffSalary(db, actor, input);
    expect(result.id).toBeDefined();
    expect(result.fullName).toBe("Ravi Kumar");
    expect(result.monthlySalaryMinor).toBe(1500000);
    expect(result.status).toBe("active");
  });

  it("throws ForbiddenError for care role", () => {
    const input: CreateStaffSalaryInput = {
      homeId,
      fullName: "Ravi Kumar",
      roleTitle: "Kitchen Staff",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
    };
    const actor = { userId: "care-1", role: "care" as const };
    expect(() => createStaffSalary(db, actor, input)).toThrow("Forbidden");
  });

  it("throws ValidationError for missing fullName", () => {
    const input: CreateStaffSalaryInput = {
      homeId,
      fullName: "",
      roleTitle: "Kitchen Staff",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
    };
    const actor = { userId: "admin-1", role: "admin" as const };
    expect(() => createStaffSalary(db, actor, input)).toThrow();
  });

  it("throws ValidationError for invalid roleTitle", () => {
    const input: CreateStaffSalaryInput = {
      homeId,
      fullName: "Ravi Kumar",
      roleTitle: "Cook",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
    };
    const actor = { userId: "admin-1", role: "admin" as const };
    expect(() => createStaffSalary(db, actor, input)).toThrow(
      "Role title must be Nurse, Care taker, or Kitchen Staff.",
    );
  });
});

describe("listStaffSalariesPaged for care users", () => {
  let db: ReturnType<typeof setupTestDb>["db"];
  let sqlite: Database.Database;
  let homeId: string;
  const careUserId = randomUUID();
  const otherCareId = randomUUID();

  beforeEach(() => {
    const opened = setupTestDb();
    db = opened.db;
    sqlite = opened.sqlite;
    homeId = seedHome(db);
    const now = Date.now();
    db.insert(schema.users)
      .values([
        {
          id: careUserId,
          email: "care@village.test",
          passwordHash: "hash",
          role: "care",
          failureTimestampsUtcMs: "[]",
          createdAtUtcMs: now,
          primaryHomeId: homeId,
          preferredLocale: "en",
        },
        {
          id: otherCareId,
          email: "other@village.test",
          passwordHash: "hash",
          role: "care",
          failureTimestampsUtcMs: "[]",
          createdAtUtcMs: now,
          primaryHomeId: homeId,
          preferredLocale: "en",
        },
      ])
      .run();
    const adminActor = { userId: "admin-1", role: "admin" as const };
    createStaffSalary(db, adminActor, {
      homeId,
      userId: careUserId,
      fullName: "Linked Care Worker",
      roleTitle: "Nurse",
      monthlySalaryMinor: 2000000,
      effectiveFrom: "2026-01-01",
    });
    createStaffSalary(db, adminActor, {
      homeId,
      userId: otherCareId,
      fullName: "Other Worker",
      roleTitle: "Kitchen Staff",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("returns only the care user's linked record", () => {
    const actor = { userId: careUserId, role: "care" as const };
    const result = listStaffSalariesPaged(db, actor, { homeId });
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.fullName).toBe("Linked Care Worker");
  });

  it("returns empty when care user has no linked record", () => {
    const unlinkedCareId = randomUUID();
    const now = Date.now();
    db.insert(schema.users)
      .values({
        id: unlinkedCareId,
        email: "unlinked@village.test",
        passwordHash: "hash",
        role: "care",
        failureTimestampsUtcMs: "[]",
        createdAtUtcMs: now,
        primaryHomeId: homeId,
        preferredLocale: "en",
      })
      .run();
    const actor = { userId: unlinkedCareId, role: "care" as const };
    const result = listStaffSalariesPaged(db, actor, { homeId });
    expect(result.totalCount).toBe(0);
  });
});

describe("createRemittance ledger integration", () => {
  let db: ReturnType<typeof setupTestDb>["db"];
  let sqlite: Database.Database;
  let homeId: string;
  let salaryId: string;
  const adminUserId = "admin-1";
  const adminActor = { userId: adminUserId, role: "admin" as const };

  beforeEach(() => {
    const opened = setupTestDb();
    db = opened.db;
    sqlite = opened.sqlite;
    homeId = seedHome(db);
    seedAdminUser(db, adminUserId);
    const salary = createStaffSalary(db, adminActor, {
      homeId,
      fullName: "Ravi Kumar",
      roleTitle: "Kitchen Staff",
      monthlySalaryMinor: 1500000,
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

  it("posts payment linked to accrual charge when marking paid", () => {
    const accrual = db
      .select()
      .from(salaryAccruals)
      .where(eq(salaryAccruals.staffSalaryId, salaryId))
      .get()!;

    const remittance = createRemittance(db, adminActor, {
      staffSalaryId: salaryId,
      homeId,
      periodYear: 2026,
      periodMonth: 3,
      amountPaidMinor: 1500000,
      paidOn: "2026-03-05",
      paymentMethod: "cash",
    });

    expect(remittance.paymentLedgerTransactionId).toBeDefined();
    expect(remittance.salaryAccrualId).toBe(accrual.id);

    const paymentTxn = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.id, remittance.paymentLedgerTransactionId))
      .get();

    expect(paymentTxn).toBeDefined();
    expect(paymentTxn!.accountType).toBe("home");
    expect(paymentTxn!.txnType).toBe("payment");
    expect(paymentTxn!.amountMinor).toBe(-remittance.amountPaidMinor);
    expect(paymentTxn!.memo).toBe(
      formatSalaryPaymentChargeMemo(accrual.chargeLedgerTransactionId),
    );
    expect(paymentTxn!.postedAtUtcMs).toBe(calendarDateIsoToUtcMs("2026-03-05"));

    const updatedAccrual = db
      .select()
      .from(salaryAccruals)
      .where(eq(salaryAccruals.id, accrual.id))
      .get();
    expect(updatedAccrual?.status).toBe("paid");
  });

  it("rejects remittance without accrual", () => {
    const otherSalary = createStaffSalary(db, adminActor, {
      homeId,
      fullName: "No Accrual Staff",
      roleTitle: "Nurse",
      monthlySalaryMinor: 2000000,
      effectiveFrom: "2026-01-01",
    });

    expect(() =>
      createRemittance(db, adminActor, {
        staffSalaryId: otherSalary.id,
        homeId,
        periodYear: 2026,
        periodMonth: 3,
        amountPaidMinor: 2000000,
        paidOn: "2026-03-05",
      }),
    ).toThrow("Generate salary accruals for this month before marking paid.");
  });

  it("rejects remittance when amountPaidMinor differs from accrued amount", () => {
    expect(() =>
      createRemittance(db, adminActor, {
        staffSalaryId: salaryId,
        homeId,
        periodYear: 2026,
        periodMonth: 3,
        amountPaidMinor: 1,
        paidOn: "2026-03-05",
      }),
    ).toThrow("Amount paid must equal the accrued salary amount");
  });

  it("rejects duplicate remittance for the same staff period", () => {
    createRemittance(db, adminActor, {
      staffSalaryId: salaryId,
      homeId,
      periodYear: 2026,
      periodMonth: 3,
      amountPaidMinor: 1500000,
      paidOn: "2026-03-05",
    });

    expect(() =>
      createRemittance(db, adminActor, {
        staffSalaryId: salaryId,
        homeId,
        periodYear: 2026,
        periodMonth: 3,
        amountPaidMinor: 1500000,
        paidOn: "2026-03-10",
      }),
    ).toThrow("Salary already marked as paid");
  });

  it("deleteRemittance removes payment and restores accrual", () => {
    generateMonthlySalaryAccruals(db, adminActor, {
      homeId,
      billingMonth: "2026-04",
    });

    const remittance = createRemittance(db, adminActor, {
      staffSalaryId: salaryId,
      homeId,
      periodYear: 2026,
      periodMonth: 4,
      amountPaidMinor: 1500000,
      paidOn: "2026-04-01",
    });

    deleteRemittance(db, adminActor, homeId, remittance.id);

    const txn = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.id, remittance.paymentLedgerTransactionId))
      .get();
    expect(txn).toBeUndefined();

    const remittanceRow = db
      .select()
      .from(schema.salaryRemittances)
      .where(eq(schema.salaryRemittances.id, remittance.id))
      .get();
    expect(remittanceRow).toBeUndefined();

    const aprilAccrual = db
      .select()
      .from(salaryAccruals)
      .where(eq(salaryAccruals.staffSalaryId, salaryId))
      .all()
      .find((a) => a.periodMonth === 4);
    expect(aprilAccrual?.status).toBe("accrued");
  });
});
