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
  otherCharges,
  residentMonthlyCharges,
  residentPayments,
  residents,
  users,
} from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import {
  BillingBatchError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import { createResident } from "@/lib/residents/service";
import { createUser } from "@/lib/users/service";
import { createWard } from "@/lib/wards/service";
import {
  createBatchPaymentsForCharges,
  createPaymentForCharge,
  deletePaymentForCharge,
  listHomeMonthlyChargesLedger,
  listHomeMonthlyPaymentsLedger,
  listHomeOtherChargesLedger,
  MAX_PAYMENTS_LEDGER_PAGE_SIZE,
  listHomeUnpaidMonthlyChargesWorklist,
  listResidentMonthlyCharges,
  payBillingMonthsForResident,
  updatePaymentForCharge,
} from "./residentCharges";

const STRONG = "ChangeMeNow!1";
const adminActor = { userId: "admin-billing", role: "admin" as const };

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

function insertCharge(
  db: ReturnType<typeof getDb>,
  input: {
    residentId: string;
    billingMonth: string;
    wardIdSnapshot: string;
    amountMinorSnapshot: number;
  },
) {
  const now = Date.now();
  const id = randomUUID();
  db.insert(residentMonthlyCharges)
    .values({
      id,
      residentId: input.residentId,
      billingMonth: input.billingMonth,
      wardIdSnapshot: input.wardIdSnapshot,
      amountMinorSnapshot: input.amountMinorSnapshot,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  return id;
}

function fortyOneValidBillingMonths(): string[] {
  const out: string[] = [];
  let y = 2020;
  let m = 1;
  for (let i = 0; i < 41; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

describe("resident monthly charges & payments (16c)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-billing-${randomUUID()}.sqlite`,
    );
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

  it("lists charges with paid false when no payment exists", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const chargeId = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-04",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 1000,
    });

    const rows = listResidentMonthlyCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(chargeId);
    expect(rows[0]!.paid).toBe(false);
    expect(rows[0]!.payment).toBeNull();
    expect(rows[0]!.wardLabel).toBe("W");
  });

  it("creates a full payment and marks charge paid", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 500,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Sam",
      dob: "1940-02-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const chargeId = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-05",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 500,
    });

    const updated = createPaymentForCharge(
      db,
      adminActor,
      home.id,
      res.id,
      chargeId,
      { amountMinor: 500, paidOn: "2026-05-10", notes: "Bank transfer" },
    );
    expect(updated.paid).toBe(true);
    expect(updated.payment?.amountMinor).toBe(500);
    expect(updated.payment?.paidOn).toBe("2026-05-10");
    expect(updated.payment?.notes).toBe("Bank transfer");
    expect(updated.payment?.recordedByUserId).toBe(adminActor.userId);
  });

  it("rejects amount that does not match charge snapshot", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "X",
      dob: "1940-03-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const chargeId = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-06",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 100,
    });

    expect(() =>
      createPaymentForCharge(
        db,
        adminActor,
        home.id,
        res.id,
        chargeId,
        { amountMinor: 99, paidOn: "2026-06-01" },
      ),
    ).toThrow(ValidationError);
  });

  it("rejects a second payment for the same charge", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Y",
      dob: "1940-04-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const chargeId = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-07",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 200,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 200,
      paidOn: "2026-07-01",
    });

    expect(() =>
      createPaymentForCharge(db, adminActor, home.id, res.id, chargeId, {
        amountMinor: 200,
        paidOn: "2026-07-02",
      }),
    ).toThrow(ValidationError);
  });

  it("allows admin to update and delete payment", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Z",
      dob: "1940-05-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const chargeId = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-08",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 300,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 300,
      paidOn: "2026-08-01",
      notes: "A",
    });

    const edited = updatePaymentForCharge(
      db,
      adminActor,
      home.id,
      res.id,
      chargeId,
      { paidOn: "2026-08-02", notes: "B" },
    );
    expect(edited.payment?.paidOn).toBe("2026-08-02");
    expect(edited.payment?.notes).toBe("B");

    const cleared = deletePaymentForCharge(
      db,
      adminActor,
      home.id,
      res.id,
      chargeId,
    );
    expect(cleared.paid).toBe(false);
    expect(cleared.payment).toBeNull();
    expect(db.select().from(residentPayments).all()).toHaveLength(0);
  });

  it("does not let Care list charges or record payments", async () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const care = await createUser(db, "admin", {
      email: "care-bill@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "C",
      dob: "1940-06-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const chargeId = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-09",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 400,
    });
    const careActor = { userId: care.id, role: "care" as const };

    expect(() =>
      listResidentMonthlyCharges(db, careActor, home.id, res.id),
    ).toThrow(ForbiddenError);
    expect(() =>
      createPaymentForCharge(db, careActor, home.id, res.id, chargeId, {
        amountMinor: 400,
        paidOn: "2026-09-01",
      }),
    ).toThrow(ForbiddenError);
  });

  it("lists home monthly charge ledger for a billing month range (18a)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 900,
    });
    const activeRes = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Active Pat",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const departedRes = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Gone Kim",
      dob: "1940-02-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    db.update(residents)
      .set({ status: "departed", updatedAtUtcMs: now })
      .where(eq(residents.id, departedRes.id))
      .run();

    insertCharge(db, {
      residentId: activeRes.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 900,
    });
    insertCharge(db, {
      residentId: departedRes.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 900,
    });
    insertCharge(db, {
      residentId: activeRes.id,
      billingMonth: "2025-11",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 900,
    });

    const out = listHomeMonthlyChargesLedger(db, adminActor, home.id, {
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-04",
      page: 1,
      pageSize: 100,
    });
    expect(out.rows).toHaveLength(2);
    const byName = [...out.rows].sort((a, b) =>
      a.residentFullName.localeCompare(b.residentFullName),
    );
    expect(byName[0]!.residentFullName).toBe("Active Pat");
    expect(byName[0]!.residentStatus).toBe("active");
    expect(byName[0]!.billingMonth).toBe("2026-03");
    expect(byName[0]!.paid).toBe(false);
    expect(byName[1]!.residentFullName).toBe("Gone Kim");
    expect(byName[1]!.residentStatus).toBe("departed");
  });

  it("does not let Care load the home monthly charge ledger (18a)", async () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const care = await createUser(db, "admin", {
      email: "care-ledger@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const careActor = { userId: care.id, role: "care" as const };

    expect(() =>
      listHomeMonthlyChargesLedger(db, careActor, home.id, {
        billingMonthFrom: "2026-01",
        billingMonthTo: "2026-04",
        page: 1,
        pageSize: 25,
      }),
    ).toThrow(ForbiddenError);
  });

  it("returns 404 for unknown home on ledger (18a)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);

    expect(() =>
      listHomeMonthlyChargesLedger(db, adminActor, randomUUID(), {
        billingMonthFrom: "2026-01",
        billingMonthTo: "2026-04",
        page: 1,
        pageSize: 25,
      }),
    ).toThrow(NotFoundError);
  });

  it("pages ledger rows with stable sort and totalCount (22c)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 900,
    });
    const ann = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Ann",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const bob = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Bob",
      dob: "1940-02-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const cara = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Cara",
      dob: "1940-03-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    insertCharge(db, {
      residentId: ann.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 900,
    });
    insertCharge(db, {
      residentId: bob.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 900,
    });
    insertCharge(db, {
      residentId: cara.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 900,
    });

    const p1 = listHomeMonthlyChargesLedger(db, adminActor, home.id, {
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-04",
      page: 1,
      pageSize: 2,
    });
    expect(p1.totalCount).toBe(3);
    expect(p1.rows).toHaveLength(2);
    expect(p1.rows[0]!.residentFullName).toBe("Ann");
    expect(p1.rows[1]!.residentFullName).toBe("Bob");
    expect(p1.summary.totalBilledMinor).toBe(2700);
    expect(p1.summary.chargeCount).toBe(3);
    expect(p1.summary.unpaidBalanceMinor).toBe(2700);

    const p2 = listHomeMonthlyChargesLedger(db, adminActor, home.id, {
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-04",
      page: 2,
      pageSize: 2,
    });
    expect(p2.totalCount).toBe(3);
    expect(p2.rows).toHaveLength(1);
    expect(p2.rows[0]!.residentFullName).toBe("Cara");
  });

  it("combines unpaid filter with pagination and totalCount (22c)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 900,
    });
    const ann = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Ann",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const bob = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Bob",
      dob: "1940-02-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const cara = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Cara",
      dob: "1940-03-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    insertCharge(db, {
      residentId: ann.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 100,
    });
    insertCharge(db, {
      residentId: bob.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 200,
    });
    const paidId = insertCharge(db, {
      residentId: cara.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 300,
    });
    createPaymentForCharge(db, adminActor, home.id, cara.id, paidId, {
      amountMinor: 300,
      paidOn: "2026-03-10",
    });

    const u1 = listHomeMonthlyChargesLedger(db, adminActor, home.id, {
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-04",
      paymentStatus: "unpaid",
      page: 1,
      pageSize: 1,
    });
    expect(u1.totalCount).toBe(2);
    expect(u1.rows).toHaveLength(1);
    expect(u1.rows[0]!.paid).toBe(false);
    expect(u1.summary.unpaidBalanceMinor).toBe(300);
    expect(u1.summary.paidCount).toBe(0);

    const u2 = listHomeMonthlyChargesLedger(db, adminActor, home.id, {
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-04",
      paymentStatus: "unpaid",
      page: 2,
      pageSize: 1,
    });
    expect(u2.totalCount).toBe(2);
    expect(u2.rows).toHaveLength(1);
    expect(u2.rows[0]!.paid).toBe(false);
    expect(u2.rows[0]!.residentFullName).not.toBe(u1.rows[0]!.residentFullName);
  });

  it("caps charges ledger page size at max (22c)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Solo",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 1,
    });
    const out = listHomeMonthlyChargesLedger(db, adminActor, home.id, {
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-04",
      page: 1,
      pageSize: 500,
    });
    expect(out.pageSize).toBe(100);
  });

  it("returns empty rows for out-of-range page with correct totalCount (22c)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Solo",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 1,
    });
    const out = listHomeMonthlyChargesLedger(db, adminActor, home.id, {
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-04",
      page: 99,
      pageSize: 2,
    });
    expect(out.rows).toHaveLength(0);
    expect(out.totalCount).toBe(1);
  });

  it("returns 404 when charge id does not belong to resident in path", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const r1 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "One",
      dob: "1940-07-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const r2 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Two",
      dob: "1940-08-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const otherCharge = insertCharge(db, {
      residentId: r2.id,
      billingMonth: "2026-10",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 1,
    });

    expect(() =>
      createPaymentForCharge(db, adminActor, home.id, r1.id, otherCharge, {
        amountMinor: 1,
        paidOn: "2026-10-01",
      }),
    ).toThrow(NotFoundError);
  });

  it("worklist sorts residents by oldest unpaid billing month, then name (18b)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1000,
    });
    const ann = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Ann",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const bob = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Bob",
      dob: "1940-02-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    insertCharge(db, {
      residentId: ann.id,
      billingMonth: "2026-02",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 1000,
    });
    insertCharge(db, {
      residentId: bob.id,
      billingMonth: "2026-01",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 1000,
    });

    const worklist = listHomeUnpaidMonthlyChargesWorklist(
      db,
      adminActor,
      home.id,
    );
    expect(worklist.map((w) => w.residentFullName)).toEqual(["Bob", "Ann"]);
    expect(worklist[0]!.oldestUnpaidBillingMonth).toBe("2026-01");
    expect(worklist[1]!.oldestUnpaidBillingMonth).toBe("2026-02");
  });

  it("batch payment records multiple unpaid charges with one paidOn and notes (18b)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 700,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Multi",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const c1 = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 700,
    });
    const c2 = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-04",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 700,
    });

    const updated = createBatchPaymentsForCharges(db, adminActor, home.id, res.id, {
      chargeIds: [c1, c2],
      paidOn: "2026-04-20",
      notes: "One transfer",
    });
    expect(updated).toHaveLength(2);
    expect(updated.every((u) => u.paid)).toBe(true);
    expect(updated.every((u) => u.payment?.paidOn === "2026-04-20")).toBe(true);
    expect(updated.every((u) => u.payment?.notes === "One transfer")).toBe(true);
    expect(db.select().from(residentPayments).all()).toHaveLength(2);
  });

  it("batch payment applies zero rows when any charge is already paid (18b)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Mix",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const paidCharge = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-05",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 400,
    });
    const unpaidCharge = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-06",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 400,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, paidCharge, {
      amountMinor: 400,
      paidOn: "2026-05-01",
    });

    expect(() =>
      createBatchPaymentsForCharges(db, adminActor, home.id, res.id, {
        chargeIds: [paidCharge, unpaidCharge],
        paidOn: "2026-06-10",
      }),
    ).toThrow(ValidationError);
    expect(db.select().from(residentPayments).all()).toHaveLength(1);
  });

  it("does not let Care load unpaid worklist or batch pay (18b)", async () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const care = await createUser(db, "admin", {
      email: "care-worklist@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "CareBlock",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const c1 = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-07",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 300,
    });
    const careActor = { userId: care.id, role: "care" as const };

    expect(() =>
      listHomeUnpaidMonthlyChargesWorklist(db, careActor, home.id),
    ).toThrow(ForbiddenError);
    expect(() =>
      createBatchPaymentsForCharges(db, careActor, home.id, res.id, {
        chargeIds: [c1],
        paidOn: "2026-07-01",
      }),
    ).toThrow(ForbiddenError);
  });
});

describe("pay billing months (19a)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-billing-19a-${randomUUID()}.sqlite`,
    );
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

  it("active: materializes missing month and records full payment", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1200,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Active",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    const updated = payBillingMonthsForResident(db, adminActor, home.id, res.id, {
      billingMonths: ["2026-12"],
      paidOn: "2026-12-15",
      notes: "Batch",
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]!.billingMonth).toBe("2026-12");
    expect(updated[0]!.paid).toBe(true);
    expect(updated[0]!.amountMinorSnapshot).toBe(1200);
    expect(updated[0]!.payment?.notes).toBe("Batch");
    expect(db.select().from(residentPayments).all()).toHaveLength(1);
  });

  it("departed: fails with NO_CHARGE_ROW when no existing row for month", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 800,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Gone",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    db.update(residents)
      .set({ status: "departed", updatedAtUtcMs: now })
      .where(eq(residents.id, res.id))
      .run();

    expect(() =>
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2026-03"],
        paidOn: "2026-03-01",
      }),
    ).toThrow(BillingBatchError);
    try {
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2026-03"],
        paidOn: "2026-03-01",
      });
    } catch (e) {
      expect(e).toBeInstanceOf(BillingBatchError);
      expect((e as BillingBatchError).code).toBe("NO_CHARGE_ROW");
      expect((e as BillingBatchError).month).toBe("2026-03");
    }
    expect(db.select().from(residentPayments).all()).toHaveLength(0);
  });

  it("departed: pays existing unpaid row", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 900,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Left",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    db.update(residents)
      .set({ status: "departed", updatedAtUtcMs: now })
      .where(eq(residents.id, res.id))
      .run();
    const chargeId = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-04",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 900,
    });

    const updated = payBillingMonthsForResident(db, adminActor, home.id, res.id, {
      billingMonths: ["2026-04"],
      paidOn: "2026-04-10",
    });
    expect(updated[0]!.id).toBe(chargeId);
    expect(updated[0]!.paid).toBe(true);
  });

  it("fails BEFORE_ADMISSION for months strictly before admission month", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 500,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Late",
      dob: "1940-01-01",
      admissionDate: "2024-06-15",
      wardId: ward.id,
    });

    expect(() =>
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2024-05"],
        paidOn: "2024-05-01",
      }),
    ).toThrow(BillingBatchError);
    try {
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2024-05"],
        paidOn: "2024-05-01",
      });
    } catch (e) {
      expect((e as BillingBatchError).code).toBe("BEFORE_ADMISSION");
      expect((e as BillingBatchError).month).toBe("2024-05");
    }
  });

  it("fails ALREADY_PAID when a selected month is already paid", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 600,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Paid",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const c = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-05",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 600,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, c, {
      amountMinor: 600,
      paidOn: "2026-05-01",
    });

    expect(() =>
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2026-05"],
        paidOn: "2026-05-02",
      }),
    ).toThrow(BillingBatchError);
  });

  it("uses sorted month order for first failure (already paid on earlier month)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 700,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Order",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const later = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-04",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 700,
    });
    const earlier = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-01",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 700,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, earlier, {
      amountMinor: 700,
      paidOn: "2026-01-01",
    });

    expect(() =>
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2026-04", "2026-01"],
        paidOn: "2026-04-01",
      }),
    ).toThrow(BillingBatchError);
    try {
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2026-04", "2026-01"],
        paidOn: "2026-04-01",
      });
    } catch (e) {
      expect((e as BillingBatchError).code).toBe("ALREADY_PAID");
      expect((e as BillingBatchError).month).toBe("2026-01");
    }
    expect(
      listResidentMonthlyCharges(db, adminActor, home.id, res.id).find(
        (x) => x.id === later,
      )!.paid,
    ).toBe(false);
  });

  it("rolls back completely when any month fails (no partial payments)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 400,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Atomic",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const unpaid = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-07",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 400,
    });
    const paid = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-08",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 400,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, paid, {
      amountMinor: 400,
      paidOn: "2026-08-01",
    });

    expect(() =>
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2026-07", "2026-08"],
        paidOn: "2026-08-10",
      }),
    ).toThrow(BillingBatchError);
    expect(
      listResidentMonthlyCharges(db, adminActor, home.id, res.id).find(
        (x) => x.id === unpaid,
      )!.paid,
    ).toBe(false);
    expect(db.select().from(residentPayments).all()).toHaveLength(1);
  });

  it("rejects more than 40 distinct months (TOO_MANY_MONTHS)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 300,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Cap",
      dob: "1940-01-01",
      admissionDate: "2020-01-01",
      wardId: ward.id,
    });
    const months = fortyOneValidBillingMonths();

    expect(() =>
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: months,
        paidOn: "2020-06-01",
      }),
    ).toThrow(BillingBatchError);
    try {
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: months,
        paidOn: "2020-06-01",
      });
    } catch (e) {
      expect((e as BillingBatchError).code).toBe("TOO_MANY_MONTHS");
    }
  });

  it("dedupes duplicate months in the request", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 550,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Dedupe",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    payBillingMonthsForResident(db, adminActor, home.id, res.id, {
      billingMonths: ["2026-09", "2026-09", "2026-10"],
      paidOn: "2026-09-20",
    });
    expect(db.select().from(residentPayments).all()).toHaveLength(2);
  });

  it("active: NO_WARD_RATE when resident has no ward for a new month", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 100,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "NoWard",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    db.update(residents)
      .set({ wardId: null, updatedAtUtcMs: Date.now() })
      .where(eq(residents.id, res.id))
      .run();

    expect(() =>
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2027-01"],
        paidOn: "2027-01-01",
      }),
    ).toThrow(BillingBatchError);
    try {
      payBillingMonthsForResident(db, adminActor, home.id, res.id, {
        billingMonths: ["2027-01"],
        paidOn: "2027-01-01",
      });
    } catch (e) {
      expect((e as BillingBatchError).code).toBe("NO_WARD_RATE");
    }
  });

  it("does not let Care call pay by billing months", async () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 100,
    });
    const care = await createUser(db, "admin", {
      email: "care-19a@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "C",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-11",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 100,
    });
    const careActor = { userId: care.id, role: "care" as const };

    expect(() =>
      payBillingMonthsForResident(db, careActor, home.id, res.id, {
        billingMonths: ["2026-11"],
        paidOn: "2026-11-01",
      }),
    ).toThrow(ForbiddenError);
  });

  it("20a: payment ledger is empty with totalCount 0 when no payments exist", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Unpaid",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-04",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 1000,
    });

    const out = listHomeMonthlyPaymentsLedger(db, adminActor, home.id, {
      page: 1,
      pageSize: 25,
    });
    expect(out.totalCount).toBe(0);
    expect(out.rows).toEqual([]);
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(25);
  });

  it("20a: lists one payment with resident, billing month, and recorded-by", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 800,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Payer",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const chargeId = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-06",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 800,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 800,
      paidOn: "2026-06-12",
      notes: "EFT",
    });

    const out = listHomeMonthlyPaymentsLedger(db, adminActor, home.id, {
      page: 1,
      pageSize: 10,
    });
    expect(out.totalCount).toBe(1);
    expect(out.rows).toHaveLength(1);
    const row = out.rows[0]!;
    expect(row.residentFullName).toBe("Payer");
    expect(row.billingMonth).toBe("2026-06");
    expect(row.paidOn).toBe("2026-06-12");
    expect(row.amountMinor).toBe(800);
    expect(row.notes).toBe("EFT");
    expect(row.recordedByEmail).toBe(`${adminActor.userId}@billing.test`);
  });

  it("20a: sorts by paidOn desc then createdAtUtcMs", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 100,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "S",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const c1 = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-01",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 100,
    });
    const c2 = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-02",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 100,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, c1, {
      amountMinor: 100,
      paidOn: "2026-05-01",
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, c2, {
      amountMinor: 100,
      paidOn: "2026-06-01",
    });

    const out = listHomeMonthlyPaymentsLedger(db, adminActor, home.id, {
      page: 1,
      pageSize: 10,
    });
    expect(out.rows.map((r) => r.billingMonth)).toEqual(["2026-02", "2026-01"]);
  });

  it("20a: same paidOn — newer createdAt appears first", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 50,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Tie",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const c1 = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-03",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 50,
    });
    const c2 = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-04",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 50,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, c1, {
      amountMinor: 50,
      paidOn: "2026-07-15",
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, c2, {
      amountMinor: 50,
      paidOn: "2026-07-15",
    });

    const out = listHomeMonthlyPaymentsLedger(db, adminActor, home.id, {
      page: 1,
      pageSize: 10,
    });
    expect(out.rows[0]!.billingMonth).toBe("2026-04");
    expect(out.rows[1]!.billingMonth).toBe("2026-03");
  });

  it("20a: pagination returns second page and full totalCount", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "P",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    for (let m = 1; m <= 3; m++) {
      const cid = insertCharge(db, {
        residentId: res.id,
        billingMonth: `2026-0${m}`,
        wardIdSnapshot: ward.id,
        amountMinorSnapshot: 1,
      });
      createPaymentForCharge(db, adminActor, home.id, res.id, cid, {
        amountMinor: 1,
        paidOn: `2026-0${m}-10`,
      });
    }

    const p1 = listHomeMonthlyPaymentsLedger(db, adminActor, home.id, {
      page: 1,
      pageSize: 1,
    });
    expect(p1.totalCount).toBe(3);
    expect(p1.rows).toHaveLength(1);
    expect(p1.rows[0]!.paidOn).toBe("2026-03-10");

    const p2 = listHomeMonthlyPaymentsLedger(db, adminActor, home.id, {
      page: 2,
      pageSize: 1,
    });
    expect(p2.totalCount).toBe(3);
    expect(p2.rows[0]!.paidOn).toBe("2026-02-10");
  });

  it("20a: page beyond data returns empty rows and correct totalCount", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const cid = insertCharge(db, {
      residentId: res.id,
      billingMonth: "2026-01",
      wardIdSnapshot: ward.id,
      amountMinorSnapshot: 1,
    });
    createPaymentForCharge(db, adminActor, home.id, res.id, cid, {
      amountMinor: 1,
      paidOn: "2026-01-20",
    });

    const out = listHomeMonthlyPaymentsLedger(db, adminActor, home.id, {
      page: 5,
      pageSize: 10,
    });
    expect(out.totalCount).toBe(1);
    expect(out.rows).toEqual([]);
  });

  it("20a: caps page size at max", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const out = listHomeMonthlyPaymentsLedger(db, adminActor, home.id, {
      page: 1,
      pageSize: 500,
    });
    expect(out.pageSize).toBe(100);
  });

  it("20a: Care cannot load payment ledger", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const care = { userId: "care-20a", role: "care" as const };
    db.insert(users)
      .values({
        id: care.userId,
        email: "care-20a-pl@x.test",
        passwordHash: "x",
        role: "care",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: Date.now(),
        primaryHomeId: home.id,
      })
      .run();

    expect(() =>
      listHomeMonthlyPaymentsLedger(db, care, home.id, {
        page: 1,
        pageSize: 25,
      }),
    ).toThrow(ForbiddenError);
  });

  it("20a: throws NotFound for unknown home", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);

    expect(() =>
      listHomeMonthlyPaymentsLedger(db, adminActor, randomUUID(), {
        page: 1,
        pageSize: 10,
      }),
    ).toThrow(NotFoundError);
  });

  it("20a: excludes payments for other homes", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const h1 = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const h2 = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const w1 = createWard(db, adminActor, h1.id, { label: "W" });
    const w2 = createWard(db, adminActor, h2.id, { label: "W" });
    const r1 = createResident(db, adminActor, {
      homeId: h1.id,
      fullName: "A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: w1.id,
    });
    const r2 = createResident(db, adminActor, {
      homeId: h2.id,
      fullName: "B",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: w2.id,
    });
    const c1 = insertCharge(db, {
      residentId: r1.id,
      billingMonth: "2026-01",
      wardIdSnapshot: w1.id,
      amountMinorSnapshot: 1,
    });
    const c2 = insertCharge(db, {
      residentId: r2.id,
      billingMonth: "2026-01",
      wardIdSnapshot: w2.id,
      amountMinorSnapshot: 1,
    });
    createPaymentForCharge(db, adminActor, h1.id, r1.id, c1, {
      amountMinor: 1,
      paidOn: "2026-01-01",
    });
    createPaymentForCharge(db, adminActor, h2.id, r2.id, c2, {
      amountMinor: 1,
      paidOn: "2026-01-01",
    });

    const out = listHomeMonthlyPaymentsLedger(db, adminActor, h1.id, {
      page: 1,
      pageSize: 25,
    });
    expect(out.totalCount).toBe(1);
    expect(out.rows[0]!.residentFullName).toBe("A");
  });
});

describe("listHomeOtherChargesLedger (21c)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-other-charges-ledger-${randomUUID()}.sqlite`,
    );
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

  it("returns registration and deposit rows for the home (admin)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
      otherChargesIntake: {
        registration: { amountMinor: 100_00, received: false, paidOn: null },
        deposit: { amountMinor: 500_00, received: true, paidOn: "2026-01-10" },
      },
    });
    const out = listHomeOtherChargesLedger(db, adminActor, home.id, {
      receivedFilter: "all",
      page: 1,
      pageSize: 25,
    });
    expect(out.rows).toHaveLength(2);
    const reg = out.rows.find((x) => x.type === "registration");
    const dep = out.rows.find((x) => x.type === "deposit");
    expect(reg?.residentId).toBe(r.id);
    expect(reg?.received).toBe(false);
    expect(dep?.paidOn).toBe("2026-01-10");
  });

  it("filters by unpaid, paid, and resident", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const r1 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
      otherChargesIntake: {
        registration: { amountMinor: 1, received: false, paidOn: null },
        deposit: { amountMinor: 2, received: true, paidOn: "2026-01-01" },
      },
    });
    const r2 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "B",
      dob: "1940-02-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    db.insert(otherCharges)
      .values({
        id: randomUUID(),
        residentId: r2.id,
        type: "registration",
        amountMinor: 3,
        received: false,
        paidOn: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();

    const unpaid = listHomeOtherChargesLedger(db, adminActor, home.id, {
      receivedFilter: "unpaid",
      page: 1,
      pageSize: 25,
    });
    expect(unpaid.rows.map((x) => x.residentId).sort()).toEqual(
      [r1.id, r2.id].sort(),
    );
    expect(unpaid.rows).toHaveLength(2);

    const paid = listHomeOtherChargesLedger(db, adminActor, home.id, {
      receivedFilter: "paid",
      page: 1,
      pageSize: 25,
    });
    expect(paid.rows).toHaveLength(1);
    expect(paid.rows[0]!.type).toBe("deposit");
    expect(paid.rows[0]!.residentId).toBe(r1.id);

    const forA = listHomeOtherChargesLedger(db, adminActor, home.id, {
      residentId: r1.id,
      receivedFilter: "all",
      page: 1,
      pageSize: 25,
    });
    expect(forA.rows).toHaveLength(2);

    const forB = listHomeOtherChargesLedger(db, adminActor, home.id, {
      residentId: r2.id,
      receivedFilter: "all",
      page: 1,
      pageSize: 25,
    });
    expect(forB.rows).toHaveLength(1);
  });

  it("rejects non-admin and unknown home (21c)", async () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-oc@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const careActor = { userId: care.id, role: "care" as const };

    expect(() =>
      listHomeOtherChargesLedger(db, careActor, home.id, {
        receivedFilter: "all",
        page: 1,
        pageSize: 25,
      }),
    ).toThrow(ForbiddenError);

    expect(() =>
      listHomeOtherChargesLedger(db, adminActor, randomUUID(), {
        receivedFilter: "all",
        page: 1,
        pageSize: 25,
      }),
    ).toThrow(NotFoundError);
  });

  it("rejects residentId that is not in the home (21c)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const h1 = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    const h2 = createHome(db, "admin", {
      name: "H2",
      defaultCurrencyCode: "NZD",
    });
    const w1 = createWard(db, adminActor, h1.id, { label: "W" });
    const w2 = createWard(db, adminActor, h2.id, { label: "W" });
    const rOther = createResident(db, adminActor, {
      homeId: h2.id,
      fullName: "X",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: w2.id,
    });
    const ward = w1;
    createResident(db, adminActor, {
      homeId: h1.id,
      fullName: "Y",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
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

  it("paginates with totalCount, summary over full filter, and stable order (22d)", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "W" });
    const r1 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alpha",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
      otherChargesIntake: {
        registration: { amountMinor: 10_00, received: false, paidOn: null },
        deposit: { amountMinor: 20_00, received: true, paidOn: "2026-01-10" },
      },
    });
    const r2 = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Beta",
      dob: "1940-02-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    db.insert(otherCharges)
      .values({
        id: randomUUID(),
        residentId: r2.id,
        type: "registration",
        amountMinor: 30_00,
        received: false,
        paidOn: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();

    const p1 = listHomeOtherChargesLedger(db, adminActor, home.id, {
      receivedFilter: "all",
      page: 1,
      pageSize: 2,
    });
    expect(p1.totalCount).toBe(3);
    expect(p1.rows).toHaveLength(2);
    expect(p1.page).toBe(1);
    expect(p1.pageSize).toBe(2);
    expect(p1.summary.totalAmountMinor).toBe(10_00 + 20_00 + 30_00);
    expect(p1.summary.outstandingAmountMinor).toBe(10_00 + 30_00);
    expect(p1.summary.receivedLineCount).toBe(1);
    /* Alpha before Beta; registration before deposit. */
    expect(p1.rows[0]!.residentId).toBe(r1.id);
    expect(p1.rows[0]!.type).toBe("registration");
    expect(p1.rows[1]!.type).toBe("deposit");

    const p2 = listHomeOtherChargesLedger(db, adminActor, home.id, {
      receivedFilter: "all",
      page: 2,
      pageSize: 2,
    });
    expect(p2.rows).toHaveLength(1);
    expect(p2.rows[0]!.residentId).toBe(r2.id);
    expect(p2.summary).toEqual(p1.summary);

    const oob = listHomeOtherChargesLedger(db, adminActor, home.id, {
      receivedFilter: "all",
      page: 9,
      pageSize: 2,
    });
    expect(oob.rows).toEqual([]);
    expect(oob.totalCount).toBe(3);

    const maxed = listHomeOtherChargesLedger(db, adminActor, home.id, {
      receivedFilter: "all",
      page: 1,
      pageSize: 500,
    });
    expect(maxed.pageSize).toBe(MAX_PAYMENTS_LEDGER_PAGE_SIZE);
  });
});
