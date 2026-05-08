import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  billingTransactions,
  invoiceLineItems,
  invoices,
  residentAccounts,
  users,
} from "@/db/schema";
import { closeDbConnection, getDb } from "@/db/client";
import { ValidationError } from "@/lib/homes/errors";
import { createHome } from "@/lib/homes/service";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import { finalizeInvoice } from "./invoiceLifecycle";
import { reversePostedBillingTransaction, reversePostedBillingTransactionForResident } from "./ledgerReversal";
import { getResidentStatement, recordPayment } from "./paymentsLifecycle";

const adminActor = { userId: "admin-reversal", role: "admin" as const };

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
      email: `${userId}@reversal.test`,
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
    name: "Reversal Home",
    defaultCurrencyCode: "NZD",
  });
  const ward = createWard(db, adminActor, home.id, { label: "Ward R" });
  const resident = createResident(db, adminActor, {
    homeId: home.id,
    fullName: "Resident Reversal",
    dob: "1940-03-03",
    admissionDate: "2025-03-01",
    wardId: ward.id,
  });
  const account = db
    .select()
    .from(residentAccounts)
    .where(eq(residentAccounts.residentId, resident.id))
    .get();
  if (!account) {
    throw new Error("resident account was not created");
  }

  return { homeId: home.id, accountId: account.id, wardId: ward.id, residentId: resident.id };
}

function seedAndFinalizeCharge(
  db: ReturnType<typeof getDb>,
  homeId: string,
  accountId: string,
  wardId: string,
  amountMinor: number,
  billingPeriod: string,
  finalizedAtUtcMs: number,
): string {
  const now = Date.now();
  const invoiceId = randomUUID();
  db.insert(invoices)
    .values({
      id: invoiceId,
      accountId,
      status: "draft",
      billingPeriod,
      issuedOn: null,
      totalMinorSnapshot: null,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  db.insert(invoiceLineItems)
    .values({
      id: randomUUID(),
      invoiceId,
      category: "monthly_fee",
      description: `${billingPeriod} fee`,
      amountMinor,
      serviceMonth: billingPeriod,
      wardIdSnapshot: wardId,
      quantity: 1,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  const { postedTransactionIds } = finalizeInvoice(db, adminActor, {
    homeId,
    invoiceId,
    finalizedAtUtcMs,
  });
  return postedTransactionIds[0]!;
}

describe("ledger reversal (PR5)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-reversal-${randomUUID()}.sqlite`);
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

  it("reverses a charge with opposite signed amount and nets to zero in statement order", () => {
    const db = getDb();
    const { homeId, accountId, wardId } = seedBillingAccount(db);
    const t0 = 5000;
    const chargeId = seedAndFinalizeCharge(db, homeId, accountId, wardId, 80_000, "2026-05", t0);

    const { reversalTransactionId } = reversePostedBillingTransaction(db, adminActor, {
      accountId,
      originalTransactionId: chargeId,
      memo: "Wrong month",
      postedAtUtcMs: t0 + 1,
    });

    const rev = db.select().from(billingTransactions).where(eq(billingTransactions.id, reversalTransactionId)).get();
    expect(rev?.txnType).toBe("reversal");
    expect(rev?.amountMinor).toBe(-80_000);
    expect(rev?.reversesTransactionId).toBe(chargeId);
    expect(rev?.sourceKind).toBe("reversal");

    const st = getResidentStatement(db, adminActor, { accountId });
    expect(st.lines.map((l) => l.transaction.txnType)).toEqual(["charge", "reversal"]);
    expect(st.lines.map((l) => l.transaction.amountMinor)).toEqual([80_000, -80_000]);
    expect(st.lines.map((l) => l.runningBalanceMinor)).toEqual([80_000, 0]);
    expect(st.currentBalanceMinor).toBe(0);
  });

  it("reverses a payment and reconstruction shows net zero for the pair", () => {
    const db = getDb();
    const { accountId } = seedBillingAccount(db);
    const t0 = 10_000;
    const { ledgerTransactionId: payLedgerId } = recordPayment(db, adminActor, {
      accountId,
      amountMinor: 25_000,
      receivedOn: "2026-05-01",
      method: "transfer",
      postedAtUtcMs: t0,
    });

    reversePostedBillingTransaction(db, adminActor, {
      accountId,
      originalTransactionId: payLedgerId,
      postedAtUtcMs: t0 + 1,
    });

    const st = getResidentStatement(db, adminActor, { accountId });
    expect(st.lines.map((l) => l.transaction.amountMinor)).toEqual([-25_000, 25_000]);
    expect(st.currentBalanceMinor).toBe(0);
  });

  it("rejects duplicate reversal of the same source row", () => {
    const db = getDb();
    const { homeId, accountId, wardId } = seedBillingAccount(db);
    const chargeId = seedAndFinalizeCharge(db, homeId, accountId, wardId, 10_000, "2026-06", 6000);

    reversePostedBillingTransaction(db, adminActor, {
      accountId,
      originalTransactionId: chargeId,
      postedAtUtcMs: 6001,
    });

    expect(() =>
      reversePostedBillingTransaction(db, adminActor, {
        accountId,
        originalTransactionId: chargeId,
        postedAtUtcMs: 6002,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects reversing a reversal row", () => {
    const db = getDb();
    const { homeId, accountId, wardId } = seedBillingAccount(db);
    const chargeId = seedAndFinalizeCharge(db, homeId, accountId, wardId, 5000, "2026-07", 7000);
    const { reversalTransactionId } = reversePostedBillingTransaction(db, adminActor, {
      accountId,
      originalTransactionId: chargeId,
      postedAtUtcMs: 7001,
    });

    expect(() =>
      reversePostedBillingTransaction(db, adminActor, {
        accountId,
        originalTransactionId: reversalTransactionId,
        postedAtUtcMs: 7002,
      }),
    ).toThrow(ValidationError);
  });

  it("reversePostedBillingTransactionForResident scopes to home resident account", () => {
    const db = getDb();
    const { homeId, residentId, accountId, wardId } = seedBillingAccount(db);
    const chargeId = seedAndFinalizeCharge(db, homeId, accountId, wardId, 12_000, "2026-08", 8000);

    const result = reversePostedBillingTransactionForResident(db, adminActor, {
      homeId,
      residentId,
      originalTransactionId: chargeId,
      postedAtUtcMs: 8001,
    });
    expect(result.reversalTransactionId).toMatch(/[0-9a-f-]{36}/i);
  });
});
