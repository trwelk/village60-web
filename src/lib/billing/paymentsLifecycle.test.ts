import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  billingPayments,
  billingTransactions,
  invoiceLineItems,
  invoices,
  accounts,
  residents,
  users,
} from "@/db/schema";
import { closeDbConnection, getDb } from "@/db/client";
import { createHome } from "@/lib/homes/service";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import { ForbiddenError } from "@/lib/homes/errors";
import { createUser } from "@/lib/users/service";
import { finalizeInvoice } from "./invoiceLifecycle";
import {
  getResidentBillingStatement,
  getResidentStatement,
  recordPayment,
  recordPaymentForHome,
  recordPaymentForResident,
} from "./paymentsLifecycle";
import { listHomeMonthlyPaymentsLedger } from "./residentCharges";

const STRONG = "ChangeMeNow!1";
const adminActor = { userId: "admin-payments", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

function seedAdminUser(db: ReturnType<typeof getDb>, userId: string) {
  const now = Date.now();
  db.insert(users)
    .values({
      id: userId,
      email: `${userId}@billing.test`,
      passwordHash: "x",
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: now,
      primaryHomeId: null,
    })
    .run();
}

function seedBillingAccount(db: ReturnType<typeof getDb>) {
  seedAdminUser(db, adminActor.userId);
  const home = createHome(db, "admin", {
    name: "Payments Home",
    defaultCurrencyCode: "NZD",
  });
  const ward = createWard(db, adminActor, home.id, { label: "Kiwi Ward" });
  const resident = createResident(db, adminActor, {
    homeId: home.id,
    fullName: "Resident Payments",
    dob: "1942-02-02",
    admissionDate: "2025-02-01",
    wardId: ward.id,
  });
  const account = db
    .select()
    .from(accounts)
    .where(eq(accounts.residentId, resident.id))
    .get();
  if (!account) {
    throw new Error("resident account was not created");
  }

  return { homeId: home.id, accountId: account.id, wardId: ward.id };
}

function seedFinalizedInvoiceCharge(
  db: ReturnType<typeof getDb>,
  homeId: string,
  accountId: string,
  amountMinor: number,
  billingPeriod: string,
  finalizedAtUtcMs: number,
) {
  const now = Date.now();
  const invoiceId = randomUUID();
  db.insert(invoices)
    .values({
      id: invoiceId,
      accountId,
      homeId,
      invNo: `INV-${invoiceId.replace(/-/g, "").slice(0, 8)}`,
      purchaseOrderId: null,
      status: "draft",
      issuedOn: `${billingPeriod}-01`,
      totalMinorSnapshot: null,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  const lineId = randomUUID();
  db.insert(invoiceLineItems)
    .values({
      id: lineId,
      invoiceId,
      category: "monthly_fee",
      description: `${billingPeriod} fee`,
      amountMinor,
      serviceMonth: billingPeriod,
      quantity: 1,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  finalizeInvoice(db, adminActor, { homeId, invoiceId, finalizedAtUtcMs });
}

describe("payments lifecycle + statement", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-payments-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("records payment receipt metadata and linked negative ledger transaction atomically", () => {
    const db = getDb();
    const { accountId } = seedBillingAccount(db);
    const postedAtUtcMs = Date.now();

    const result = recordPayment(db, adminActor, {
      accountId,
      amountMinor: 150000,
      receivedOn: "2026-05-07",
      method: "bank_transfer",
      externalReference: "BNK-REF-991",
      notes: "Family payment",
      postedAtUtcMs,
    });

    const payment = db.select().from(billingPayments).where(eq(billingPayments.id, result.paymentId)).get();
    expect(payment).toBeTruthy();
    expect(payment?.amountMinor).toBe(150000);
    expect(payment?.method).toBe("bank_transfer");
    expect(payment?.externalReference).toBe("BNK-REF-991");
    expect(payment?.ledgerTransactionId).toBe(result.ledgerTransactionId);

    const txn = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.id, result.ledgerTransactionId))
      .get();
    expect(txn).toBeTruthy();
    expect(txn?.txnType).toBe("payment");
    expect(txn?.amountMinor).toBe(-150000);
    expect(txn?.sourceKind).toBe("payment");
    expect(txn?.sourceId).toBe(result.paymentId);
    expect(txn?.postedAtUtcMs).toBe(postedAtUtcMs);
  });

  it("records home operating account payment with ledger accountType home", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Home ops payments",
      defaultCurrencyCode: "NZD",
    });
    const postedAtUtcMs = Date.now();
    const result = recordPaymentForHome(db, adminActor, {
      homeId: home.id,
      amountMinor: 42000,
      receivedOn: "2026-06-15",
      method: "transfer",
      notes: "Operating credit",
      postedAtUtcMs,
    });

    const homeAccount = db
      .select()
      .from(accounts)
      .where(and(eq(accounts.homeId, home.id), eq(accounts.accountType, "home")))
      .get();
    expect(homeAccount).toBeTruthy();

    const payment = db
      .select()
      .from(billingPayments)
      .where(eq(billingPayments.id, result.paymentId))
      .get();
    expect(payment?.accountId).toBe(homeAccount?.id);

    const txn = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.id, result.ledgerTransactionId))
      .get();
    expect(txn?.accountType).toBe("home");
    expect(txn?.amountMinor).toBe(-42000);
  });

  it("returns deterministic statement lines with running balance and current ledger sum", () => {
    const db = getDb();
    const { accountId } = seedBillingAccount(db);

    db.insert(billingTransactions)
      .values([
        {
          id: "txn-b",
          accountId,
          txnType: "adjustment",
          amountMinor: 500,
          sourceKind: "adjustment",
          sourceId: "adj-1",
          memo: "Adjustment",
          recordedByUserId: adminActor.userId,
          postedAtUtcMs: 2000,
        },
        {
          id: "txn-a",
          accountId,
          txnType: "charge",
          amountMinor: 1000,
          sourceKind: "seed",
          sourceId: "seed-1",
          memo: "Seed",
          recordedByUserId: adminActor.userId,
          postedAtUtcMs: 1000,
        },
        {
          id: "txn-c",
          accountId,
          txnType: "payment",
          amountMinor: -700,
          sourceKind: "payment",
          sourceId: "pay-1",
          memo: "Payment",
          recordedByUserId: adminActor.userId,
          postedAtUtcMs: 2000,
        },
      ])
      .run();

    const statement = getResidentStatement(db, adminActor, { accountId });
    expect(statement.lines.map((l) => l.transaction.id)).toEqual(["txn-a", "txn-b", "txn-c"]);
    expect(statement.lines.map((l) => l.runningBalanceMinor)).toEqual([1000, 1500, 800]);
    expect(statement.currentBalanceMinor).toBe(800);
  });

  it("handles prepayment credit then later invoice charges as drawdown", () => {
    const db = getDb();
    const { homeId, accountId } = seedBillingAccount(db);
    const startTs = Date.now();

    recordPayment(db, adminActor, {
      accountId,
      amountMinor: 300000,
      receivedOn: "2026-01-10",
      method: "transfer",
      externalReference: "UPFRONT-3000",
      notes: "Advance payment",
      postedAtUtcMs: startTs,
    });

    seedFinalizedInvoiceCharge(db, homeId, accountId, 100000, "2026-02", startTs + 1000);
    seedFinalizedInvoiceCharge(db, homeId, accountId, 100000, "2026-03", startTs + 2000);
    seedFinalizedInvoiceCharge(db, homeId, accountId, 100000, "2026-04", startTs + 3000);

    const statement = getResidentStatement(db, adminActor, { accountId });
    expect(statement.lines.map((l) => l.runningBalanceMinor)).toEqual([-300000, -200000, -100000, 0]);
    expect(statement.currentBalanceMinor).toBe(0);
  });

  it("marks finalized invoices paid in FIFO order when payment only partially covers balance", () => {
    const db = getDb();
    const { homeId, accountId } = seedBillingAccount(db);
    const startTs = Date.now();

    seedFinalizedInvoiceCharge(db, homeId, accountId, 100000, "2026-02", startTs + 1000);
    seedFinalizedInvoiceCharge(db, homeId, accountId, 80000, "2026-03", startTs + 2000);

    recordPayment(db, adminActor, {
      accountId,
      amountMinor: 150000,
      receivedOn: "2026-03-15",
      method: "transfer",
      postedAtUtcMs: startTs + 3000,
    });

    const febInvoice = db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.accountId, accountId),
          sql`substr(${invoices.issuedOn}, 1, 7) = '2026-02'`,
          eq(invoices.totalMinorSnapshot, 100000),
        ),
      )
      .get();
    const marInvoice = db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.accountId, accountId),
          sql`substr(${invoices.issuedOn}, 1, 7) = '2026-03'`,
          eq(invoices.totalMinorSnapshot, 80000),
        ),
      )
      .get();

    expect(febInvoice?.status).toBe("paid");
    expect(marInvoice?.status).toBe("finalized");
  });

  it("marks new finalized invoice paid immediately when prepayment credit already exists", () => {
    const db = getDb();
    const { homeId, accountId } = seedBillingAccount(db);
    const startTs = Date.now();

    recordPayment(db, adminActor, {
      accountId,
      amountMinor: 300000,
      receivedOn: "2026-01-10",
      method: "transfer",
      postedAtUtcMs: startTs,
    });

    seedFinalizedInvoiceCharge(db, homeId, accountId, 100000, "2026-02", startTs + 1000);

    const invoice = db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.accountId, accountId),
          sql`substr(${invoices.issuedOn}, 1, 7) = '2026-02'`,
          eq(invoices.totalMinorSnapshot, 100000),
        ),
      )
      .get();
    expect(invoice?.status).toBe("paid");
  });

  it("does not keep invoices paid after payment adjustment removes credit", () => {
    const db = getDb();
    const { homeId, accountId } = seedBillingAccount(db);
    const startTs = Date.now();

    seedFinalizedInvoiceCharge(db, homeId, accountId, 600000, "2026-02", startTs + 1000);

    recordPayment(db, adminActor, {
      accountId,
      amountMinor: 600000,
      receivedOn: "2026-02-10",
      method: "transfer",
      postedAtUtcMs: startTs + 2000,
    });

    db.insert(billingTransactions)
      .values({
        id: randomUUID(),
        accountId,
        txnType: "adjustment",
        amountMinor: 600000,
        sourceKind: "adjustment",
        sourceId: randomUUID(),
        memo: "Payment correction",
        recordedByUserId: adminActor.userId,
        postedAtUtcMs: startTs + 3000,
      })
      .run();

    seedFinalizedInvoiceCharge(db, homeId, accountId, 120000, "2026-03", startTs + 4000);

    const febInvoice = db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.accountId, accountId),
          sql`substr(${invoices.issuedOn}, 1, 7) = '2026-02'`,
          eq(invoices.totalMinorSnapshot, 600000),
        ),
      )
      .get();
    const marInvoice = db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.accountId, accountId),
          sql`substr(${invoices.issuedOn}, 1, 7) = '2026-03'`,
          eq(invoices.totalMinorSnapshot, 120000),
        ),
      )
      .get();

    expect(febInvoice?.status).toBe("finalized");
    expect(marInvoice?.status).toBe("finalized");
  });

  it("billing statement and resident payment recording require admin", async () => {
    const db = getDb();
    const { homeId, accountId } = seedBillingAccount(db);
    const care = await createUser(db, "admin", {
      email: `care-payments-${randomUUID()}@example.com`,
      password: STRONG,
      role: "care",
      primaryHomeId: homeId,
    });
    const careActor = { userId: care.id, role: "care" as const };

    const residentRow = db
      .select({ id: residents.id })
      .from(residents)
      .innerJoin(accounts, eq(accounts.residentId, residents.id))
      .where(eq(accounts.id, accountId))
      .get();
    if (!residentRow) {
      throw new Error("resident for account");
    }

    expect(() =>
      getResidentBillingStatement(db, careActor, {
        homeId,
        residentId: residentRow.id,
      }),
    ).toThrow(ForbiddenError);

    expect(() =>
      recordPaymentForResident(db, careActor, {
        homeId,
        residentId: residentRow.id,
        amountMinor: 100,
        receivedOn: "2026-05-07",
        method: "cash",
      }),
    ).toThrow(ForbiddenError);
  });

  it("admin can load resident billing statement by home + resident id", () => {
    const db = getDb();
    const { homeId, accountId } = seedBillingAccount(db);
    const residentRow = db
      .select({ id: residents.id })
      .from(residents)
      .innerJoin(accounts, eq(accounts.residentId, residents.id))
      .where(eq(accounts.id, accountId))
      .get();
    if (!residentRow) {
      throw new Error("resident for account");
    }

    const statement = getResidentBillingStatement(db, adminActor, {
      homeId,
      residentId: residentRow.id,
    });
    expect(statement.accountId).toBe(accountId);
    expect(Array.isArray(statement.lines)).toBe(true);
  });

  it("returns forbidden when session actor user no longer exists", () => {
    const db = getDb();
    const { accountId } = seedBillingAccount(db);
    db.delete(users).where(eq(users.id, adminActor.userId)).run();

    expect(() =>
      recordPayment(db, adminActor, {
        accountId,
        amountMinor: 100,
        receivedOn: "2026-05-08",
        method: "transfer",
        postedAtUtcMs: Date.now(),
      }),
    ).toThrow(ForbiddenError);
  });

  it("includes direct resident payments in the home monthly payments ledger", () => {
    const db = getDb();
    const { homeId, accountId } = seedBillingAccount(db);
    const postedAtUtcMs = Date.now();

    recordPayment(db, adminActor, {
      accountId,
      amountMinor: 77500,
      receivedOn: "2026-05-08",
      method: "transfer",
      postedAtUtcMs,
    });

    const ledger = listHomeMonthlyPaymentsLedger(db, adminActor, homeId, {
      page: 1,
      pageSize: 25,
    });
    expect(ledger.totalCount).toBe(1);
    expect(ledger.rows[0]?.amountMinor).toBe(77500);
    expect(ledger.rows[0]?.billingMonth).toBe("2026-05");
  });
});
