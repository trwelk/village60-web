import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { billingTransactions, accounts, residents, users } from "@/db/schema";
import { closeDbConnection, getDb } from "@/db/client";
import { createHome } from "@/lib/homes/service";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import { ForbiddenError } from "@/lib/homes/errors";
import { createUser } from "@/lib/users/service";
import {
  getResidentBillingStatement,
  getResidentStatement,
  listAllResidentLedgerLines,
} from "./paymentsLifecycle";

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

  it("billing statement requires admin", async () => {
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

  it("lists all resident ledger lines with per-account running balance", () => {
    const db = getDb();
    const { homeId, accountId } = seedBillingAccount(db);

    db.insert(billingTransactions)
      .values({
        id: "txn-1",
        accountId,
        txnType: "charge",
        amountMinor: 5000,
        sourceKind: "seed",
        sourceId: "seed-1",
        memo: "Charge",
        recordedByUserId: adminActor.userId,
        postedAtUtcMs: 1000,
      })
      .run();

    const lines = listAllResidentLedgerLines(db, adminActor, homeId);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.runningBalanceMinor).toBe(5000);
    expect(lines[0]?.accountId).toBe(accountId);
  });
});
