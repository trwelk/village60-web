import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  billingPayments,
  billingTransactions,
  invoiceLineItems,
  invoices,
  accounts,
  users,
} from "@/db/schema";
import { closeDbConnection, getDb } from "@/db/client";
import { ValidationError } from "@/lib/homes/errors";
import { createHome } from "@/lib/homes/service";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import { finalizeInvoice } from "./invoiceLifecycle";
import { payInvoice, unpayInvoice } from "./invoicePayments";
import { calendarDateIsoToUtcMs } from "./receivedOnUtcMs";

const adminActor = { userId: "admin-invoice-pay", role: "admin" as const };

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

function seedFinalizedInvoice(
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
  db.insert(invoiceLineItems)
    .values({
      id: randomUUID(),
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
  return invoiceId;
}

describe("invoicePayments", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-invoice-pay-${randomUUID()}.sqlite`);
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

  it("marks a finalized invoice paid with a full payment", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Pay Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Pay Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pay Resident",
      dob: "1940-01-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const account = db.select().from(accounts).where(eq(accounts.residentId, resident.id)).get();
    if (!account) {
      throw new Error("account missing");
    }

    const invoiceId = seedFinalizedInvoice(
      db,
      home.id,
      account.id,
      100000,
      "2026-02",
      Date.now(),
    );

    const r = payInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId,
      paidOnUtcMs: calendarDateIsoToUtcMs("2026-02-15"),
      method: "cash",
    });

    const inv = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
    expect(inv?.status).toBe("paid");

    const txn = db
      .select()
      .from(billingTransactions)
      .where(
        and(
          eq(billingTransactions.sourceKind, "invoice_payment"),
          eq(billingTransactions.sourceId, invoiceId),
        ),
      )
      .get();
    expect(txn?.amountMinor).toBe(-(inv!.totalMinorSnapshot!));

    const pay = db
      .select()
      .from(billingPayments)
      .where(eq(billingPayments.id, r.paymentId))
      .get();
    expect(pay?.invoiceId).toBe(invoiceId);
  });

  it("rejects paying a draft invoice", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Draft Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Draft Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Draft Resident",
      dob: "1940-01-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const account = db.select().from(accounts).where(eq(accounts.residentId, resident.id)).get();
    if (!account) {
      throw new Error("account missing");
    }

    const invoiceId = randomUUID();
    const now = Date.now();
    db.insert(invoices)
      .values({
        id: invoiceId,
        accountId: account.id,
        homeId: home.id,
        invNo: "INV-DRAFT",
        purchaseOrderId: null,
        status: "draft",
        issuedOn: "2026-02-01",
        totalMinorSnapshot: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();

    expect(() =>
      payInvoice(db, adminActor, {
        homeId: home.id,
        invoiceId,
        paidOnUtcMs: calendarDateIsoToUtcMs("2026-02-15"),
        method: "cash",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects paying an already-paid invoice", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Paid Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Paid Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Paid Resident",
      dob: "1940-01-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const account = db.select().from(accounts).where(eq(accounts.residentId, resident.id)).get();
    if (!account) {
      throw new Error("account missing");
    }

    const invoiceId = seedFinalizedInvoice(
      db,
      home.id,
      account.id,
      100000,
      "2026-02",
      Date.now(),
    );

    payInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId,
      paidOnUtcMs: calendarDateIsoToUtcMs("2026-02-15"),
      method: "cash",
    });

    expect(() =>
      payInvoice(db, adminActor, {
        homeId: home.id,
        invoiceId,
        paidOnUtcMs: calendarDateIsoToUtcMs("2026-02-16"),
        method: "cash",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects paying a zero-total invoice", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Zero Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Zero Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Zero Resident",
      dob: "1940-01-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const account = db.select().from(accounts).where(eq(accounts.residentId, resident.id)).get();
    if (!account) {
      throw new Error("account missing");
    }

    const invoiceId = randomUUID();
    const now = Date.now();
    db.insert(invoices)
      .values({
        id: invoiceId,
        accountId: account.id,
        homeId: home.id,
        invNo: "INV-ZERO",
        purchaseOrderId: null,
        status: "finalized",
        issuedOn: "2026-02-01",
        totalMinorSnapshot: 0,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();

    expect(() =>
      payInvoice(db, adminActor, {
        homeId: home.id,
        invoiceId,
        paidOnUtcMs: calendarDateIsoToUtcMs("2026-02-15"),
        method: "cash",
      }),
    ).toThrow(ValidationError);
  });

  it("unpayInvoice deletes the payment and returns invoice to finalized", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Unpay Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Unpay Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Unpay Resident",
      dob: "1940-01-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const account = db.select().from(accounts).where(eq(accounts.residentId, resident.id)).get();
    if (!account) {
      throw new Error("account missing");
    }

    const invoiceId = seedFinalizedInvoice(
      db,
      home.id,
      account.id,
      100000,
      "2026-02",
      Date.now(),
    );

    payInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId,
      paidOnUtcMs: calendarDateIsoToUtcMs("2026-02-15"),
      method: "cash",
    });

    unpayInvoice(db, adminActor, { homeId: home.id, invoiceId });

    const inv = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
    expect(inv?.status).toBe("finalized");

    const txn = db
      .select()
      .from(billingTransactions)
      .where(
        and(
          eq(billingTransactions.sourceKind, "invoice_payment"),
          eq(billingTransactions.sourceId, invoiceId),
        ),
      )
      .get();
    expect(txn).toBeUndefined();

    const pay = db
      .select()
      .from(billingPayments)
      .where(eq(billingPayments.invoiceId, invoiceId))
      .get();
    expect(pay).toBeUndefined();
  });

  it("finalize no longer auto-marks invoice paid when credit exists", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "No FIFO Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "No FIFO Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "No FIFO Resident",
      dob: "1940-01-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const account = db.select().from(accounts).where(eq(accounts.residentId, resident.id)).get();
    if (!account) {
      throw new Error("account missing");
    }

    const startTs = Date.now();
    db.insert(billingTransactions)
      .values({
        id: randomUUID(),
        accountId: account.id,
        accountType: "resident",
        txnType: "payment",
        amountMinor: -300000,
        sourceKind: "payment",
        sourceId: randomUUID(),
        memo: "Legacy prepayment",
        recordedByUserId: adminActor.userId,
        postedAtUtcMs: startTs,
      })
      .run();

    const invoiceId = seedFinalizedInvoice(
      db,
      home.id,
      account.id,
      100000,
      "2026-02",
      startTs + 1000,
    );

    const inv = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
    expect(inv?.status).toBe("finalized");
  });
});
