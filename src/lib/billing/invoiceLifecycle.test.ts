import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { billingTransactions, invoiceLineItems, invoices, residentAccounts, users } from "@/db/schema";
import { closeDbConnection, getDb } from "@/db/client";
import { ValidationError } from "@/lib/homes/errors";
import { createHome } from "@/lib/homes/service";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import { createDraftInvoice, finalizeInvoice, updateDraftInvoice } from "./invoiceLifecycle";

const adminActor = { userId: "admin-invoice", role: "admin" as const };

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

function getOrCreateAccountId(
  db: ReturnType<typeof getDb>,
  residentId: string,
  nowUtcMs: number,
): string {
  const existing = db
    .select()
    .from(residentAccounts)
    .where(eq(residentAccounts.residentId, residentId))
    .get();
  if (existing) {
    return existing.id;
  }
  const id = randomUUID();
  db.insert(residentAccounts)
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

describe("invoice lifecycle: finalize", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-invoice-${randomUUID()}.sqlite`);
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

  it("finalizes a draft invoice, snapshots total, and posts one charge transaction per line", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);

    const home = createHome(db, "admin", {
      name: "Invoice Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Kea Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Resident Invoice",
      dob: "1940-01-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });

    const now = Date.now();
    const accountId = getOrCreateAccountId(db, resident.id, now);

    const invoiceId = randomUUID();
    db.insert(invoices)
      .values({
        id: invoiceId,
        accountId,
        status: "draft",
        billingPeriod: "2026-05",
        issuedOn: null,
        totalMinorSnapshot: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();

    const line1Id = randomUUID();
    const line2Id = randomUUID();
    db.insert(invoiceLineItems)
      .values([
        {
          id: line1Id,
          invoiceId,
          category: "monthly_fee",
          description: "May monthly fee",
          amountMinor: 120000,
          serviceMonth: "2026-05",
          wardIdSnapshot: ward.id,
          quantity: 1,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        },
        {
          id: line2Id,
          invoiceId,
          category: "care_supplies",
          description: "Care supplies",
          amountMinor: 6500,
          serviceMonth: "2026-05",
          wardIdSnapshot: ward.id,
          quantity: 1,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        },
      ])
      .run();

    const result = finalizeInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId,
      finalizedAtUtcMs: now + 5000,
    });

    expect(result.invoiceId).toBe(invoiceId);
    expect(result.totalMinorSnapshot).toBe(126500);
    expect(result.postedTransactionIds).toHaveLength(2);

    const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
    expect(invoice?.status).toBe("finalized");
    expect(invoice?.totalMinorSnapshot).toBe(126500);
    expect(invoice?.issuedOn).toBe("2026-05-01");

    const txns = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.accountId, accountId))
      .all();
    expect(txns).toHaveLength(2);
    expect(txns.every((t) => t.txnType === "charge")).toBe(true);
    expect(txns.map((t) => t.amountMinor).sort((a, b) => a - b)).toEqual([6500, 120000]);
    expect(txns.map((t) => t.sourceKind).sort()).toEqual(
      ["invoice_line_item", "invoice_monthly_fee"].sort(),
    );
    expect(txns.map((t) => t.sourceId).sort()).toEqual(
      [`${accountId}:2026-05`, line2Id].sort(),
    );
  });

  it("create and update draft invoice line items before finalization", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Invoice Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Tui Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Resident Draft",
      dob: "1942-02-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    const accountId = getOrCreateAccountId(db, resident.id, now);

    const lineAId = randomUUID();
    const { invoiceId } = createDraftInvoice(db, adminActor, {
      homeId: home.id,
      accountId,
      billingPeriod: "2026-06",
      lineItems: [
        {
          id: lineAId,
          category: "monthly_fee",
          description: "Monthly fee",
          amountMinor: 100000,
          serviceMonth: "2026-06",
          wardIdSnapshot: ward.id,
        },
      ],
      nowUtcMs: now,
    });

    const lineBId = randomUUID();
    updateDraftInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId,
      lineItems: [
        {
          id: lineAId,
          category: "monthly_fee",
          description: "Monthly fee (updated)",
          amountMinor: 101000,
          serviceMonth: "2026-06",
          wardIdSnapshot: ward.id,
        },
        {
          id: lineBId,
          category: "care_supplies",
          description: "Gloves",
          amountMinor: 900,
          serviceMonth: "2026-06",
          wardIdSnapshot: ward.id,
        },
      ],
      nowUtcMs: now + 100,
    });

    const lines = db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId))
      .all();
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.id).sort()).toEqual([lineAId, lineBId].sort());
    expect(lines.find((l) => l.id === lineAId)?.amountMinor).toBe(101000);
  });

  it("re-finalize is idempotent and does not duplicate postings", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Invoice Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Kaka Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Resident Finalize Twice",
      dob: "1941-01-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    const accountId = getOrCreateAccountId(db, resident.id, now);
    const lineId = randomUUID();
    const { invoiceId } = createDraftInvoice(db, adminActor, {
      homeId: home.id,
      accountId,
      billingPeriod: "2026-07",
      lineItems: [
        {
          id: lineId,
          category: "monthly_fee",
          description: "Monthly fee",
          amountMinor: 110000,
          serviceMonth: "2026-07",
          wardIdSnapshot: ward.id,
        },
      ],
      nowUtcMs: now,
    });

    const first = finalizeInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId,
      finalizedAtUtcMs: now + 5000,
    });
    const second = finalizeInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId,
      finalizedAtUtcMs: now + 6000,
    });

    const txns = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.accountId, accountId))
      .all();
    expect(txns).toHaveLength(1);
    expect(second.totalMinorSnapshot).toBe(first.totalMinorSnapshot);
    expect(second.postedTransactionIds.sort()).toEqual(first.postedTransactionIds.sort());
  });

  it("blocks draft edits after finalization", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Invoice Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Kea Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Resident Locked",
      dob: "1943-03-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    const accountId = getOrCreateAccountId(db, resident.id, now);
    const { invoiceId } = createDraftInvoice(db, adminActor, {
      homeId: home.id,
      accountId,
      billingPeriod: "2026-07",
      lineItems: [
        {
          category: "monthly_fee",
          description: "Monthly fee",
          amountMinor: 110000,
          serviceMonth: "2026-07",
          wardIdSnapshot: ward.id,
        },
      ],
      nowUtcMs: now,
    });
    finalizeInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId,
      finalizedAtUtcMs: now + 5000,
    });

    expect(() =>
      updateDraftInvoice(db, adminActor, {
        homeId: home.id,
        invoiceId,
        lineItems: [],
        nowUtcMs: now + 6000,
      }),
    ).toThrow(ValidationError);
  });

  it("enforces monthly fee uniqueness at finalize/post time", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Invoice Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Kiwi Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Resident Monthly",
      dob: "1944-04-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    const accountId = getOrCreateAccountId(db, resident.id, now);

    const first = createDraftInvoice(db, adminActor, {
      homeId: home.id,
      accountId,
      billingPeriod: "2026-08",
      lineItems: [
        {
          category: "monthly_fee",
          description: "Monthly fee",
          amountMinor: 110000,
          serviceMonth: "2026-08",
          wardIdSnapshot: ward.id,
        },
      ],
      nowUtcMs: now,
    });
    finalizeInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId: first.invoiceId,
      finalizedAtUtcMs: now + 5000,
    });

    const second = createDraftInvoice(db, adminActor, {
      homeId: home.id,
      accountId,
      billingPeriod: "2026-08",
      lineItems: [
        {
          category: "monthly_fee",
          description: "Duplicate monthly fee",
          amountMinor: 110000,
          serviceMonth: "2026-08",
          wardIdSnapshot: ward.id,
        },
      ],
      nowUtcMs: now + 6000,
    });
    expect(() =>
      finalizeInvoice(db, adminActor, {
        homeId: home.id,
        invoiceId: second.invoiceId,
        finalizedAtUtcMs: now + 7000,
      }),
    ).toThrow();

    const secondInvoice = db
      .select()
      .from(invoices)
      .where(eq(invoices.id, second.invoiceId))
      .get();
    expect(secondInvoice?.status).toBe("draft");
    expect(secondInvoice?.totalMinorSnapshot).toBeNull();
  });

  it("finalize is atomic when one line conflicts", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "Invoice Home",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "Pukeko Ward" });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Resident Atomic",
      dob: "1945-05-01",
      admissionDate: "2025-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    const accountId = getOrCreateAccountId(db, resident.id, now);

    const existing = createDraftInvoice(db, adminActor, {
      homeId: home.id,
      accountId,
      billingPeriod: "2026-09",
      lineItems: [
        {
          category: "monthly_fee",
          description: "Already posted month",
          amountMinor: 110000,
          serviceMonth: "2026-09",
          wardIdSnapshot: ward.id,
        },
      ],
      nowUtcMs: now,
    });
    finalizeInvoice(db, adminActor, {
      homeId: home.id,
      invoiceId: existing.invoiceId,
      finalizedAtUtcMs: now + 5000,
    });

    const target = createDraftInvoice(db, adminActor, {
      homeId: home.id,
      accountId,
      billingPeriod: "2026-09",
      lineItems: [
        {
          category: "care_supplies",
          description: "Should roll back too",
          amountMinor: 700,
          serviceMonth: "2026-09",
          wardIdSnapshot: ward.id,
        },
        {
          category: "monthly_fee",
          description: "Conflicting monthly fee",
          amountMinor: 110000,
          serviceMonth: "2026-09",
          wardIdSnapshot: ward.id,
        },
      ],
      nowUtcMs: now + 6000,
    });

    expect(() =>
      finalizeInvoice(db, adminActor, {
        homeId: home.id,
        invoiceId: target.invoiceId,
        finalizedAtUtcMs: now + 7000,
      }),
    ).toThrow();

    const invoice = db.select().from(invoices).where(eq(invoices.id, target.invoiceId)).get();
    expect(invoice?.status).toBe("draft");
    const postedForTarget = db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.accountId, accountId))
      .all()
      .filter((row) => row.memo === "Should roll back too" || row.memo === "Conflicting monthly fee");
    expect(postedForTarget).toHaveLength(0);
  });
});
