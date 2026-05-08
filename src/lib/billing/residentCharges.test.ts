import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invoiceLineItems, invoices, billingTransactions, residentAccounts, users } from "@/db/schema";
import { closeDbConnection, getDb } from "@/db/client";
import { createHome } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { createResident } from "@/lib/residents/service";
import { createUser } from "@/lib/users/service";
import { createWard } from "@/lib/wards/service";
import { finalizeInvoice } from "./invoiceLifecycle";
import {
  listHomeMonthlyChargesLedger,
  listHomeOtherChargesLedger,
  listHomeUnpaidMonthlyChargesWorklist,
} from "./residentCharges";

const STRONG = "ChangeMeNow!1";
const adminActor = { userId: "admin-rc-ledger", role: "admin" as const };

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

function seedFinalizedMonthlyInvoice(
  db: ReturnType<typeof getDb>,
  homeId: string,
  accountId: string,
  wardId: string,
  billingPeriod: string,
  amountMinor: number,
  finalizedAtUtcMs: number,
) {
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
  const lineId = randomUUID();
  db.insert(invoiceLineItems)
    .values({
      id: lineId,
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
  finalizeInvoice(db, adminActor, { homeId, invoiceId, finalizedAtUtcMs });
}

describe("home billing ledgers (invoice-backed)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-resident-charges-${randomUUID()}.sqlite`);
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

  it("lists monthly charge rows from finalized invoices with paid=false until charge-specific payment", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Ledger Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "A",
      monthlyRatePerPersonMinor: 50_000,
    });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const accRow = db
      .select({ id: residentAccounts.id })
      .from(residentAccounts)
      .where(eq(residentAccounts.residentId, resident.id))
      .get();
    if (!accRow) {
      throw new Error("expected resident account");
    }

    seedFinalizedMonthlyInvoice(
      db,
      home.id,
      accRow.id,
      ward.id,
      "2026-04",
      50_000,
      Date.now(),
    );

    const chargeTxn = db
      .select()
      .from(billingTransactions)
      .where(
        and(eq(billingTransactions.accountId, accRow.id), eq(billingTransactions.txnType, "charge")),
      )
      .get();
    if (!chargeTxn) {
      throw new Error("expected charge txn");
    }

    const ledger = listHomeMonthlyChargesLedger(db, adminActor, home.id, {
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-12",
      paymentStatus: "all",
      page: 1,
      pageSize: 25,
    });
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]!.billingMonth).toBe("2026-04");
    expect(ledger.rows[0]!.paid).toBe(false);
    expect(ledger.rows[0]!.chargeId).toBe(chargeTxn.id);

    const paidLedger = listHomeMonthlyChargesLedger(db, adminActor, home.id, {
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-12",
      paymentStatus: "paid",
      page: 1,
      pageSize: 25,
    });
    expect(paidLedger.rows).toHaveLength(0);
  });

  it("rejects care users for monthly charge ledger", async () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: `care-${randomUUID()}@example.com`,
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const careActor = { userId: care.id, role: "care" as const };

    expect(() =>
      listHomeMonthlyChargesLedger(db, careActor, home.id, {
        paymentStatus: "all",
        page: 1,
        pageSize: 25,
      }),
    ).toThrow(ForbiddenError);
  });

  it("other-charges ledger rejects residentId from another home", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const h1 = createHome(db, "admin", { name: "H1", defaultCurrencyCode: "NZD" });
    const h2 = createHome(db, "admin", { name: "H2", defaultCurrencyCode: "NZD" });
    const w2 = createWard(db, adminActor, h2.id, { label: "W" });
    const rOther = createResident(db, adminActor, {
      homeId: h2.id,
      fullName: "X",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: w2.id,
    });

    expect(() =>
      listHomeOtherChargesLedger(db, adminActor, h1.id, {
        residentId: rOther.id,
        receivedFilter: "all",
        page: 1,
        pageSize: 25,
      }),
    ).toThrow(NotFoundError);
  });

  it("unpaid worklist aggregates unpaid monthly charges by resident", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 10_000,
    });
    const r1 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "One",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const acc1 = db
      .select({ id: residentAccounts.id })
      .from(residentAccounts)
      .where(eq(residentAccounts.residentId, r1.id))
      .get();
    if (!acc1) throw new Error("account");
    const ts = Date.now();
    seedFinalizedMonthlyInvoice(db, home.id, acc1.id, ward.id, "2026-01", 10_000, ts);
    seedFinalizedMonthlyInvoice(db, home.id, acc1.id, ward.id, "2026-02", 10_000, ts + 1);

    const wl = listHomeUnpaidMonthlyChargesWorklist(db, adminActor, home.id);
    expect(wl).toHaveLength(1);
    expect(wl[0]!.residentId).toBe(r1.id);
    expect(wl[0]!.unpaid).toHaveLength(2);
    expect(wl[0]!.totalUnpaidMinor).toBe(20_000);
  });
});
