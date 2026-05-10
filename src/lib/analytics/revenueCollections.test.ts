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
import {
  billingPayments,
  billingTransactions,
  homes,
  invoices,
  accounts,
  residents,
  users,
} from "@/db/schema";
import { calendarDateIsoToUtcMs } from "@/lib/billing/receivedOnUtcMs";
import { createHome } from "@/lib/homes/service";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import {
  collectionRatePercent,
  getRevenueKpis,
  listPaymentLagByHome,
  listTwelveMonthBilledVsCollected,
  paymentLagDaysFromMonthEnd,
  shiftBillingMonth,
  sumBilledForBillingMonth,
  sumCollectedForBillingMonth,
  sumOutstandingUnpaidMinor,
} from "./revenueCollections";

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

function getOrCreateAccountId(
  db: ReturnType<typeof getDb>,
  input: { residentId: string },
): string {
  const existing = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.residentId, input.residentId))
    .get();
  if (existing) {
    return existing.id;
  }
  const residentRow = db
    .select({ homeId: residents.homeId })
    .from(residents)
    .where(eq(residents.id, input.residentId))
    .get();
  if (!residentRow) {
    throw new Error("resident not found");
  }
  const homeRow = db
    .select({ currencyCode: homes.defaultCurrencyCode })
    .from(homes)
    .where(eq(homes.id, residentRow.homeId))
    .get();
  if (!homeRow) {
    throw new Error("home not found");
  }
  const accountId = randomUUID();
  const now = Date.now();
  db.insert(accounts)
    .values({
      id: accountId,
      residentId: input.residentId,
      currencyCode: homeRow.currencyCode,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  return accountId;
}

function insertPaymentAgainstAccount(
  db: ReturnType<typeof getDb>,
  input: {
    accountId: string;
    amountMinor: number;
    receivedOn: string;
    recordedByUserId: string;
    postedAfterMs: number;
  },
) {
  const paymentPostedAt = input.postedAfterMs + 1;
  const now = paymentPostedAt;
  const ledgerTransactionId = randomUUID();
  const paymentId = randomUUID();
  db.insert(billingTransactions)
    .values({
      id: ledgerTransactionId,
      accountId: input.accountId,
      accountType: "resident",
      txnType: "payment",
      amountMinor: -input.amountMinor,
      sourceKind: "payment",
      sourceId: paymentId,
      memo: null,
      recordedByUserId: input.recordedByUserId,
      postedAtUtcMs: paymentPostedAt,
    })
    .run();
  db.insert(billingPayments)
    .values({
      id: paymentId,
      accountId: input.accountId,
      amountMinor: input.amountMinor,
      receivedOn: calendarDateIsoToUtcMs(input.receivedOn),
      method: "cash",
      externalReference: null,
      notes: null,
      recordedByUserId: input.recordedByUserId,
      ledgerTransactionId,
      updatedAtUtcMs: now,
    })
    .run();
}

let chargePostedSeq = 0;

function insertCharge(
  db: ReturnType<typeof getDb>,
  input: {
    residentId: string;
    wardId: string;
    billingMonth: string;
    amountMinor: number;
    payment?: {
      amountMinor: number;
      paidOn: string;
      recordedByUserId: string;
    };
  },
) {
  void input.wardId;
  const postedAtUtcMs = Date.now() + chargePostedSeq++;
  const accountId = getOrCreateAccountId(db, { residentId: input.residentId });
  const residentHome = db
    .select({ homeId: residents.homeId })
    .from(residents)
    .where(eq(residents.id, input.residentId))
    .get();
  if (!residentHome) {
    throw new Error("resident not found");
  }
  const invoiceId = randomUUID();
  db.insert(invoices)
    .values({
      id: invoiceId,
      accountId,
      homeId: residentHome.homeId,
      invNo: `INV-${invoiceId.replace(/-/g, "").slice(0, 8)}`,
      purchaseOrderId: null,
      status: "finalized",
      issuedOn: `${input.billingMonth}-01`,
      totalMinorSnapshot: input.amountMinor,
      createdAtUtcMs: postedAtUtcMs,
      updatedAtUtcMs: postedAtUtcMs,
    })
    .run();
  db.insert(billingTransactions)
    .values({
      id: randomUUID(),
      accountId,
      txnType: "charge",
      amountMinor: input.amountMinor,
      sourceKind: "invoice",
      sourceId: invoiceId,
      memo: null,
      recordedByUserId: null,
      postedAtUtcMs,
    })
    .run();
  if (input.payment) {
    insertPaymentAgainstAccount(db, {
      accountId,
      amountMinor: input.payment.amountMinor,
      receivedOn: input.payment.paidOn,
      recordedByUserId: input.payment.recordedByUserId,
      postedAfterMs: postedAtUtcMs,
    });
  }
}

describe("revenueCollections analytics", () => {
  let dbPath: string;

  beforeEach(() => {
    chargePostedSeq = 0;
    dbPath = path.join(os.tmpdir(), `v60-rev-${randomUUID()}.sqlite`);
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

  it("sums billed amounts for a billing month", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W1" });
    const uid = randomUUID();
    seedUser(db, uid);
    const r1 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Res One",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const r2 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Res Two",
      dob: "1940-01-02",
      admissionDate: "2024-01-01",
    });
    insertCharge(db, {
      residentId: r1.id,
      wardId: ward.id,
      billingMonth: "2026-04",
      amountMinor: 10_000,
    });
    insertCharge(db, {
      residentId: r2.id,
      wardId: ward.id,
      billingMonth: "2026-04",
      amountMinor: 25_00,
    });
    insertCharge(db, {
      residentId: r1.id,
      wardId: ward.id,
      billingMonth: "2026-03",
      amountMinor: 99_99,
    });
    expect(sumBilledForBillingMonth(db, "2026-04")).toBe(12_500);
    expect(sumBilledForBillingMonth(db, "2026-01")).toBe(0);
  });

  it("sums collected amounts only for charges in that billing month", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W1" });
    const uid = randomUUID();
    seedUser(db, uid);
    const r1 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Res One",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const r2 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Res Two",
      dob: "1940-01-02",
      admissionDate: "2024-01-01",
    });
    insertCharge(db, {
      residentId: r1.id,
      wardId: ward.id,
      billingMonth: "2026-04",
      amountMinor: 10_000,
      payment: { amountMinor: 8_000, paidOn: "2026-04-28", recordedByUserId: uid },
    });
    insertCharge(db, {
      residentId: r2.id,
      wardId: ward.id,
      billingMonth: "2026-04",
      amountMinor: 5_000,
      payment: { amountMinor: 5_000, paidOn: "2026-04-30", recordedByUserId: uid },
    });
    insertCharge(db, {
      residentId: r1.id,
      wardId: ward.id,
      billingMonth: "2026-03",
      amountMinor: 3_000,
      payment: { amountMinor: 3_000, paidOn: "2026-03-10", recordedByUserId: uid },
    });
    expect(sumCollectedForBillingMonth(db, "2026-04")).toBe(13_000);
  });

  it("sums outstanding unpaid across all months", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W1" });
    const uid = randomUUID();
    seedUser(db, uid);
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Res One",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    insertCharge(db, {
      residentId: r.id,
      wardId: ward.id,
      billingMonth: "2026-04",
      amountMinor: 100_00,
    });
    insertCharge(db, {
      residentId: r.id,
      wardId: ward.id,
      billingMonth: "2026-03",
      amountMinor: 50_00,
      payment: {
        amountMinor: 50_00,
        paidOn: "2026-03-20",
        recordedByUserId: uid,
      },
    });
    expect(sumOutstandingUnpaidMinor(db)).toBe(100_00);
  });

  it("computes collection rate percent and returns null when billed is zero", () => {
    expect(collectionRatePercent(10_000, 8_200)).toBe(82);
    expect(collectionRatePercent(0, 0)).toBeNull();
  });

  it("exposes KPIs with month-on-month delta and collection rate for current month", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W1" });
    const uid = randomUUID();
    seedUser(db, uid);
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Res One",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    insertCharge(db, {
      residentId: r.id,
      wardId: ward.id,
      billingMonth: "2026-03",
      amountMinor: 50_00,
    });
    insertCharge(db, {
      residentId: r.id,
      wardId: ward.id,
      billingMonth: "2026-04",
      amountMinor: 100_00,
      payment: {
        amountMinor: 82_00,
        paidOn: "2026-04-15",
        recordedByUserId: uid,
      },
    });
    const at = Date.UTC(2026, 3, 15);
    const kpis = getRevenueKpis(db, at);
    expect(kpis.billingMonthCurrent).toBe("2026-04");
    expect(kpis.monthlyBilledMinor).toBe(100_00);
    expect(kpis.previousMonthBilledMinor).toBe(50_00);
    expect(kpis.momDeltaMinor).toBe(50_00);
    expect(kpis.momDeltaPercent).toBe(100);
    expect(kpis.collectionRatePercent).toBe(82);
    expect(kpis.outstandingUnpaidMinor).toBe(68_00);
  });

  it("fills twelve-month billed vs collected with zeros for months without charges", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W1" });
    const uid = randomUUID();
    seedUser(db, uid);
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Res One",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const gapMonth = shiftBillingMonth("2026-04", -3);
    insertCharge(db, {
      residentId: r.id,
      wardId: ward.id,
      billingMonth: gapMonth,
      amountMinor: 12_00,
      payment: {
        amountMinor: 10_00,
        paidOn: `${gapMonth}-20`,
        recordedByUserId: uid,
      },
    });
    const at = Date.UTC(2026, 3, 1);
    const series = listTwelveMonthBilledVsCollected(db, at);
    expect(series).toHaveLength(12);
    expect(series[0].monthKey).toBe(shiftBillingMonth("2026-04", -11));
    expect(series[11].monthKey).toBe("2026-04");
    const gapRow = series.find((row) => row.monthKey === shiftBillingMonth("2026-04", -2));
    expect(gapRow?.billedMinor).toBe(0);
    expect(gapRow?.collectedMinor).toBe(0);
    const dataRow = series.find((row) => row.monthKey === gapMonth);
    expect(dataRow?.billedMinor).toBe(12_00);
    expect(dataRow?.collectedMinor).toBe(10_00);
  });

  it("orders payment lag by home descending; zero lag when no payments", () => {
    const db = getDb();
    const uid = randomUUID();
    seedUser(db, uid);
    const slow = createHome(db, "admin", {
      name: "Slow Home",
      defaultCurrencyCode: "NZD",
    });
    const fast = createHome(db, "admin", {
      name: "Fast Home",
      defaultCurrencyCode: "NZD",
    });
    const w1 = createWard(db, adminActor, slow.id, { label: "W" });
    const w2 = createWard(db, adminActor, fast.id, { label: "W" });
    const r1 = createResident(db, adminActor, {
      homeId: slow.id,
      fullName: "A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const r2 = createResident(db, adminActor, {
      homeId: fast.id,
      fullName: "B",
      dob: "1940-01-02",
      admissionDate: "2024-01-01",
    });
    insertCharge(db, {
      residentId: r1.id,
      wardId: w1.id,
      billingMonth: "2026-03",
      amountMinor: 1,
      payment: {
        amountMinor: 1,
        paidOn: "2026-04-10",
        recordedByUserId: uid,
      },
    });
    insertCharge(db, {
      residentId: r2.id,
      wardId: w2.id,
      billingMonth: "2026-03",
      amountMinor: 1,
      payment: {
        amountMinor: 1,
        paidOn: "2026-03-31",
        recordedByUserId: uid,
      },
    });
    createHome(db, "admin", {
      name: "Empty Home",
      defaultCurrencyCode: "NZD",
    });

    const lag = listPaymentLagByHome(db);
    expect(lag.map((x) => x.homeName)).toEqual([
      "Slow Home",
      "Empty Home",
      "Fast Home",
    ]);
    const slowRow = lag.find((x) => x.homeName === "Slow Home");
    expect(slowRow?.averageLagDays).toBe(10);
    expect(slowRow?.hasPayments).toBe(true);
    const emptyRow = lag.find((x) => x.homeName === "Empty Home");
    expect(emptyRow?.averageLagDays).toBe(0);
    expect(emptyRow?.hasPayments).toBe(false);
  });

  it("counts payment lag from last day of billing month to paid date", () => {
    expect(paymentLagDaysFromMonthEnd("2026-04", "2026-04-30")).toBe(0);
    expect(paymentLagDaysFromMonthEnd("2026-04", "2026-05-10")).toBe(10);
  });

  it("shifts billing months across year boundaries", () => {
    expect(shiftBillingMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftBillingMonth("2025-12", 1)).toBe("2026-01");
  });
});
