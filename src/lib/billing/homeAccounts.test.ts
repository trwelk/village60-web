import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { billingTransactions, homes, homeAccounts, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError } from "@/lib/homes/errors";
import {
  ensureHomeAccount,
  getHomeAccountStatement,
  postHomeTransaction,
} from "./homeAccounts";
import { reversePostedBillingTransaction } from "./ledgerReversal";

function openMemoryDb(): { db: AppDb; sqlite: Database.Database } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  const t = Date.now();
  db.insert(users)
    .values([
      {
        id: "u-admin",
        email: "admin@test.local",
        passwordHash: "x",
        role: "admin",
        createdAtUtcMs: t,
      },
      {
        id: "u-care",
        email: "care@test.local",
        passwordHash: "x",
        role: "care",
        createdAtUtcMs: t,
      },
    ])
    .run();
  db.insert(homes)
    .values({
      id: "h1",
      name: "Sunrise Home",
      defaultCurrencyCode: "NZD",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();

  return { db, sqlite };
}

const adminActor = { userId: "u-admin", role: "admin" as const };
const careActor = { userId: "u-care", role: "care" as const };

describe("ensureHomeAccount", () => {
  it("creates a home account on first call", () => {
    const { db, sqlite } = openMemoryDb();

    const account = ensureHomeAccount(db, "h1");

    expect(account.homeId).toBe("h1");
    expect(account.currencyCode).toBe("NZD");
    expect(account.id).toBeTruthy();

    sqlite.close();
  });

  it("returns the same account on repeated calls (idempotent)", () => {
    const { db, sqlite } = openMemoryDb();

    const first = ensureHomeAccount(db, "h1");
    const second = ensureHomeAccount(db, "h1");

    expect(first.id).toBe(second.id);

    const rows = db.select().from(homeAccounts).where(eq(homeAccounts.homeId, "h1")).all();
    expect(rows).toHaveLength(1);

    sqlite.close();
  });
});

describe("postHomeTransaction", () => {
  it("rejects non-admin actors", () => {
    const { db, sqlite } = openMemoryDb();

    expect(() =>
      postHomeTransaction(db, careActor, {
        homeId: "h1",
        txnType: "expense",
        amountMinor: 5000,
        sourceKind: "home_expense",
        sourceId: "exp-1",
      }),
    ).toThrow(ForbiddenError);

    sqlite.close();
  });

  it("posts a billing transaction with accountType 'home'", () => {
    const { db, sqlite } = openMemoryDb();

    const { ledgerTransactionId, accountId } = postHomeTransaction(db, adminActor, {
      homeId: "h1",
      txnType: "expense",
      amountMinor: 10000,
      sourceKind: "home_expense",
      sourceId: "exp-1",
      memo: "Electricity bill",
    });

    const txn = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.id, ledgerTransactionId))
      .get();

    expect(txn).toBeDefined();
    expect(txn!.accountId).toBe(accountId);
    expect(txn!.accountType).toBe("home");
    expect(txn!.txnType).toBe("expense");
    expect(txn!.amountMinor).toBe(10000);
    expect(txn!.sourceKind).toBe("home_expense");
    expect(txn!.sourceId).toBe("exp-1");
    expect(txn!.memo).toBe("Electricity bill");

    sqlite.close();
  });

  it("auto-creates the home account if it did not exist", () => {
    const { db, sqlite } = openMemoryDb();

    const before = db.select().from(homeAccounts).where(eq(homeAccounts.homeId, "h1")).all();
    expect(before).toHaveLength(0);

    postHomeTransaction(db, adminActor, {
      homeId: "h1",
      txnType: "expense",
      amountMinor: 3000,
      sourceKind: "home_expense",
    });

    const after = db.select().from(homeAccounts).where(eq(homeAccounts.homeId, "h1")).all();
    expect(after).toHaveLength(1);

    sqlite.close();
  });

  it("rejects non-integer amountMinor", () => {
    const { db, sqlite } = openMemoryDb();

    expect(() =>
      postHomeTransaction(db, adminActor, {
        homeId: "h1",
        txnType: "expense",
        amountMinor: 12.5,
        sourceKind: "home_expense",
      }),
    ).toThrow(/integer/);

    sqlite.close();
  });
});

describe("getHomeAccountStatement", () => {
  it("returns empty statement when no account exists yet", () => {
    const { db, sqlite } = openMemoryDb();

    const result = getHomeAccountStatement(db, adminActor, "h1");

    expect(result.accountId).toBe("");
    expect(result.currentBalanceMinor).toBe(0);
    expect(result.lines).toHaveLength(0);

    sqlite.close();
  });

  it("computes running balance across multiple postings", () => {
    const { db, sqlite } = openMemoryDb();

    postHomeTransaction(db, adminActor, {
      homeId: "h1",
      txnType: "expense",
      amountMinor: 10000,
      sourceKind: "home_expense",
      postedAtUtcMs: 1000,
    });
    postHomeTransaction(db, adminActor, {
      homeId: "h1",
      txnType: "expense",
      amountMinor: 5000,
      sourceKind: "home_expense",
      postedAtUtcMs: 2000,
    });

    const stmt = getHomeAccountStatement(db, adminActor, "h1");

    expect(stmt.currentBalanceMinor).toBe(15000);
    expect(stmt.lines).toHaveLength(2);
    expect(stmt.lines[0]!.runningBalanceMinor).toBe(10000);
    expect(stmt.lines[1]!.runningBalanceMinor).toBe(15000);

    sqlite.close();
  });
});

describe("reversal of a home transaction", () => {
  it("reversal row inherits accountType 'home'", () => {
    const { db, sqlite } = openMemoryDb();

    const { ledgerTransactionId, accountId } = postHomeTransaction(db, adminActor, {
      homeId: "h1",
      txnType: "expense",
      amountMinor: 8000,
      sourceKind: "home_expense",
      sourceId: "exp-rev",
    });

    const { reversalTransactionId } = reversePostedBillingTransaction(db, adminActor, {
      accountId,
      originalTransactionId: ledgerTransactionId,
    });

    const reversal = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.id, reversalTransactionId))
      .get();

    expect(reversal!.accountType).toBe("home");
    expect(reversal!.txnType).toBe("reversal");
    expect(reversal!.amountMinor).toBe(-8000);

    sqlite.close();
  });
});
