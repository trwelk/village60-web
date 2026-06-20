import { randomUUID } from "node:crypto";
import { pushTestSchema } from "@/test/pushTestSchema";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import {
  billingTransactions,
  invoiceLineItems,
  invoices,
  accounts,
  residents,
  users,
} from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { ValidationError } from "@/lib/homes/errors";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import {
  createDraftInvoice,
  finalizeDraftInvoicesForBillingMonth,
  finalizeInvoiceAsTrustedSystem,
} from "./invoiceLifecycle";
import { generateMonthlyCharges } from "./generateMonthlyCharges";

const adminActor = { userId: "admin-actor", role: "admin" as const };

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

function getOrCreateAccountId(
  db: ReturnType<typeof getDb>,
  residentId: string,
  nowUtcMs: number,
): string {
  const existing = db
    .select()
    .from(accounts)
    .where(eq(accounts.residentId, residentId))
    .get();
  if (existing) {
    return existing.id;
  }
  const id = randomUUID();
  db.insert(accounts)
    .values({
      id,
      residentId,
      currencyCode: "NZD",
      createdAtUtcMs: nowUtcMs,
      updatedAtUtcMs: nowUtcMs,
    })
    .run();
  return id;
}

describe("generateMonthlyCharges (PR4 draft + finalize)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-monthly-charges-${randomUUID()}.sqlite`,
    );
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    pushTestSchema(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("creates a draft invoice and line for an active resident with ward and ward rate", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 500_00,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex Active",
      dob: "1940-01-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });

    const out = generateMonthlyCharges(db, { billingMonth: "2026-04" });
    expect(out.billingMonth).toBe("2026-04");
    expect(out.created).toBe(1);
    expect(out.skipped).toEqual([]);

    const account = db
      .select()
      .from(accounts)
      .where(eq(accounts.residentId, res.id))
      .get();
    expect(account).toBeTruthy();
    const inv = db
      .select()
      .from(invoices)
      .where(eq(invoices.accountId, account!.id))
      .get();
    expect(inv?.issuedOn).toBe("2026-04-01");
    expect(inv?.status).toBe("draft");
    expect(inv?.totalMinorSnapshot).toBeNull();

    const chargeTxn = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.accountId, account!.id))
      .get();
    expect(chargeTxn).toBeUndefined();
  });

  it("finalizeTrusted posts invoice_monthly_fee and matches ward snapshot", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 500_00,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex Active",
      dob: "1940-01-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });

    generateMonthlyCharges(db, { billingMonth: "2026-04" });
    const account = db
      .select()
      .from(accounts)
      .where(eq(accounts.residentId, res.id))
      .get();
    const inv = db
      .select()
      .from(invoices)
      .where(eq(invoices.accountId, account!.id))
      .get();
    const t1 = Date.now();
    finalizeInvoiceAsTrustedSystem(db, { invoiceId: inv!.id, finalizedAtUtcMs: t1 });

    const chargeTxn = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.accountId, account!.id))
      .get();
    expect(chargeTxn?.txnType).toBe("charge");
    expect(chargeTxn?.amountMinor).toBe(500_00);
    expect(chargeTxn?.sourceKind).toBe("invoice_monthly_fee");
    expect(chargeTxn?.sourceId).toBe(`${account!.id}:2026-04`);
  });

  it("opens invoices for all active residents and only adds monthly_fee lines when ward rate exists", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const wardNoRate = createWard(db, adminActor, home.id, {
      label: "No rate",
    });
    const wardPriced = createWard(db, adminActor, home.id, {
      label: "Priced",
      monthlyRatePerPersonMinor: 100,
    });
    const noWard = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "No Ward",
      dob: "1940-02-01",
      admissionDate: "2024-06-01",
      wardId: null,
    });
    const noRate = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "No Rate",
      dob: "1940-03-01",
      admissionDate: "2024-06-01",
      wardId: wardNoRate.id,
    });
    const pricedResident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Ok",
      dob: "1940-04-01",
      admissionDate: "2024-06-01",
      wardId: wardPriced.id,
    });

    const out = generateMonthlyCharges(db, { billingMonth: "2026-05" });
    expect(out.created).toBe(3);
    expect(out.skipped).toEqual([]);

    const allAccounts = db.select().from(accounts).all();
    expect(allAccounts).toHaveLength(3);
    const allInvoices = db.select().from(invoices).all();
    expect(allInvoices).toHaveLength(3);
    expect(allInvoices.every((row) => row.status === "draft")).toBe(true);

    const noWardAccount = allAccounts.find((row) => row.residentId === noWard.id);
    const noRateAccount = allAccounts.find((row) => row.residentId === noRate.id);
    const pricedAccount = allAccounts.find((row) => row.residentId === pricedResident.id);
    expect(noWardAccount).toBeTruthy();
    expect(noRateAccount).toBeTruthy();
    expect(pricedAccount).toBeTruthy();

    const lines = db.select().from(invoiceLineItems).all();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.category).toBe("monthly_fee");
    expect(lines[0]?.amountMinor).toBe(100);

    const rows = db.select().from(billingTransactions).all();
    expect(rows).toHaveLength(0);
  });

  it("does not charge departed residents", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 50,
    });
    const gone = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Gone",
      dob: "1940-05-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });
    db.update(residents)
      .set({ status: "departed" })
      .where(eq(residents.id, gone.id))
      .run();

    const out = generateMonthlyCharges(db, { billingMonth: "2026-06" });
    expect(out.created).toBe(0);
    expect(out.skipped).toEqual([]);
  });

  it("second identical run skips duplicate drafts without extra invoices", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 10,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Sam",
      dob: "1940-06-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });

    const first = generateMonthlyCharges(db, { billingMonth: "2026-07" });
    expect(first.created).toBe(1);

    const second = generateMonthlyCharges(db, { billingMonth: "2026-07" });
    expect(second.created).toBe(0);
    expect(second.skipped).toEqual([
      {
        residentId: res.id,
        homeId: home.id,
        reason: "duplicate",
      },
    ]);

    const invs = db.select().from(invoices).all();
    expect(invs).toHaveLength(1);
    expect(db.select().from(billingTransactions).all()).toHaveLength(0);
  });

  it("retry after posted month skips as duplicate", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 99,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Retry",
      dob: "1940-07-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });
    generateMonthlyCharges(db, { billingMonth: "2026-08" });
    const account = db
      .select()
      .from(accounts)
      .where(eq(accounts.residentId, res.id))
      .get();
    const inv = db
      .select()
      .from(invoices)
      .where(eq(invoices.accountId, account!.id))
      .get();
    finalizeInvoiceAsTrustedSystem(db, { invoiceId: inv!.id, finalizedAtUtcMs: Date.now() });

    const again = generateMonthlyCharges(db, { billingMonth: "2026-08" });
    expect(again.created).toBe(0);
    expect(again.skipped[0]?.reason).toBe("duplicate");
    expect(db.select().from(invoices).all()).toHaveLength(1);
  });

  it("finalizeDraftInvoicesForBillingMonth continues after monthly fee unique conflict", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Batch Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1000,
    });
    const now = Date.now();
    const a = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "A",
      dob: "1940-08-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });
    const b = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "B",
      dob: "1940-09-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });
    const accountA = getOrCreateAccountId(db, a.id, now);
    const accountB = getOrCreateAccountId(db, b.id, now);
    const line = {
      category: "monthly_fee",
      description: "2026-12 monthly fee",
      amountMinor: 1000,
      serviceMonth: "2026-12",
    };
    createDraftInvoice(db, adminActor, {
      homeId: home.id,
      accountId: accountA,
      lineItems: [line],
      nowUtcMs: now,
    });
    createDraftInvoice(db, adminActor, {
      homeId: home.id,
      accountId: accountA,
      lineItems: [{ ...line, description: "duplicate draft same month" }],
      nowUtcMs: now + 1,
    });
    const gen = generateMonthlyCharges(db, { billingMonth: "2026-12" });
    expect(gen.created).toBe(1);

    const batch = finalizeDraftInvoicesForBillingMonth(db, {
      billingMonth: "2026-12",
      finalizedAtUtcMs: now + 10_000,
    });
    expect(batch.conflictInvoiceIds).toHaveLength(1);
    expect(batch.finalizedInvoiceIds).toHaveLength(2);
    expect(new Set([...batch.conflictInvoiceIds, ...batch.finalizedInvoiceIds]).size).toBe(3);

    const conflictId = batch.conflictInvoiceIds[0]!;
    expect(db.select().from(invoices).where(eq(invoices.id, conflictId)).get()?.status).toBe(
      "draft",
    );
    expect(
      db
        .select()
        .from(billingTransactions)
        .where(eq(billingTransactions.accountId, accountA))
        .all(),
    ).toHaveLength(1);
    expect(
      db
        .select()
        .from(billingTransactions)
        .where(eq(billingTransactions.accountId, accountB))
        .all(),
    ).toHaveLength(1);
  });

  it("rejects invalid billing month", () => {
    const db = getDb();
    expect(() => generateMonthlyCharges(db, { billingMonth: "2026-13" })).toThrow(
      ValidationError,
    );
  });
});