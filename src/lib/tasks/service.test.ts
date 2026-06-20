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
import { createResident, departResident } from "@/lib/residents/service";
import { createUser } from "@/lib/users/service";
import { createWard } from "@/lib/wards/service";
import {
  completeTask,
  createTask,
  firstDayAfterBillingMonth,
  getTasksDashboardSummary,
  listCompletedManualTasks,
  listOpenInbox,
  listTasksForInboxQuery,
  parseTaskInboxQuery,
} from "./service";

const STRONG = "ChangeMeNow!1";
const adminActor = { userId: "admin-tasks", role: "admin" as const };

function getOrCreateAccountId(
  db: ReturnType<typeof getDb>,
  input: {
    residentId: string;
  },
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

function insertCharge(
  db: ReturnType<typeof getDb>,
  input: {
    residentId: string;
    billingMonth: string;
    amountMinor: number;
  },
) {
  const now = Date.now();
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
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  const txnId = randomUUID();
  db.insert(billingTransactions)
    .values({
      id: txnId,
      accountId,
      txnType: "charge",
      amountMinor: input.amountMinor,
      sourceKind: "invoice",
      sourceId: invoiceId,
      memo: null,
      recordedByUserId: null,
      postedAtUtcMs: now,
    })
    .run();
  return { chargeTxnId: txnId, accountId };
}

function insertPayment(
  db: ReturnType<typeof getDb>,
  input: { accountId: string; userId: string; amountMinor: number },
) {
  const now = Date.now();
  const paymentId = randomUUID();
  const txnId = randomUUID();
  db.insert(billingTransactions)
    .values({
      id: txnId,
      accountId: input.accountId,
      accountType: "resident",
      txnType: "payment",
      amountMinor: -input.amountMinor,
      sourceKind: "payment",
      sourceId: paymentId,
      memo: null,
      recordedByUserId: input.userId,
      postedAtUtcMs: now,
    })
    .run();
  db.insert(billingPayments)
    .values({
      id: paymentId,
      accountId: input.accountId,
      amountMinor: input.amountMinor,
      receivedOn: calendarDateIsoToUtcMs("2026-04-10"),
      method: "cash",
      externalReference: null,
      notes: null,
      recordedByUserId: input.userId,
      ledgerTransactionId: txnId,
      updatedAtUtcMs: now,
    })
    .run();
  return paymentId;
}

describe("firstDayAfterBillingMonth", () => {
  it("returns the first calendar day after the billing month (UTC YYYY-MM)", () => {
    expect(firstDayAfterBillingMonth("2026-03")).toBe("2026-04-01");
    expect(firstDayAfterBillingMonth("2026-12")).toBe("2027-01-01");
  });
});

describe("payment overdue task inbox (25b)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-tasks-25b-${randomUUID()}.sqlite`,
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

  it("includes an unpaid charge only after the billing month has ended (asOf UTC)", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "A" });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Morgan Lee",
      dob: "1940-05-12",
      admissionDate: "2024-01-15",
    });
    insertCharge(db, {
      residentId: r.id,
      billingMonth: "2026-04",
      amountMinor: 500_00,
    });
    // Still April 2026: April bill is not overdue yet
    const duringApril = listOpenInbox(db, adminActor, {
      asOfDateUtc: "2026-04-20",
    });
    expect(
      duringApril.filter((x) => x.kind === "payment_overdue"),
    ).toHaveLength(0);
    // From 2026-05-01 the April charge is overdue
    const may = listOpenInbox(db, adminActor, { asOfDateUtc: "2026-05-01" });
    const overdues = may.filter((x) => x.kind === "payment_overdue");
    expect(overdues).toHaveLength(1);
    expect(overdues[0]).toMatchObject({
      kind: "payment_overdue",
      homeName: "Sunrise",
      residentName: "Morgan Lee",
      billingMonth: "2026-04",
      amountMinor: 500_00,
    });
  });

  it("excludes charges that have a recorded payment", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "A" });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Morgan Lee",
      dob: "1940-05-12",
      admissionDate: "2024-01-15",
    });
    const now = Date.now();
    db.insert(users)
      .values({
        id: "paying-user",
        email: "pay@example.com",
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: now,
        primaryHomeId: null,
      })
      .run();
    const charge = insertCharge(db, {
      residentId: r.id,
      billingMonth: "2026-03",
      amountMinor: 100_00,
    });
    insertPayment(db, {
      accountId: charge.accountId,
      userId: "paying-user",
      amountMinor: 100_00,
    });
    const items = listOpenInbox(db, adminActor, { asOfDateUtc: "2026-05-15" });
    expect(
      items.filter((x) => x.kind === "payment_overdue" && x.sourceId === charge.chargeTxnId),
    ).toHaveLength(0);
  });

  it("limits payment reminders to homes assigned to a Care user", async () => {
    const db = getDb();
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const wA = createWard(db, adminActor, homeA.id, { label: "W" });
    const wB = createWard(db, adminActor, homeB.id, { label: "W" });
    const rA = createResident(db, adminActor, {
      homeId: homeA.id,
      fullName: "In A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const rB = createResident(db, adminActor, {
      homeId: homeB.id,
      fullName: "In B",
      dob: "1940-01-02",
      admissionDate: "2024-01-01",
    });
    insertCharge(db, {
      residentId: rA.id,
      billingMonth: "2026-03",
      amountMinor: 10_00,
    });
    insertCharge(db, {
      residentId: rB.id,
      billingMonth: "2026-03",
      amountMinor: 20_00,
    });
    const care = await createUser(db, "admin", {
      email: "nurse-25b@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: homeA.id,
      additionalHomeIds: [],
    });
    const forCare = listOpenInbox(
      db,
      { userId: care.id, role: "care" },
      { asOfDateUtc: "2026-04-10" },
    );
    const names = forCare
      .filter((x) => x.kind === "payment_overdue")
      .map((x) => x.residentName);
    expect(names).toEqual(["In A"]);
  });

  it("listCompletedManualTasks has no payment reminders (only manual completed rows)", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "A" });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Morgan Lee",
      dob: "1940-05-12",
      admissionDate: "2024-01-15",
    });
    insertCharge(db, {
      residentId: r.id,
      billingMonth: "2026-01",
      amountMinor: 9_00,
    });
    const completed = listCompletedManualTasks(db, adminActor);
    expect(completed).toEqual([]);
  });
});

describe("resident birthday task inbox (25c)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-tasks-25c-${randomUUID()}.sqlite`,
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

  it("includes active residents whose birthday is today with a stable yearly source id", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Birthday Today",
      dob: "1940-04-27",
      admissionDate: "2024-01-15",
    });

    const items = listOpenInbox(db, adminActor, { asOfDateUtc: "2026-04-27" });
    const birthdays = items.filter((x) => x.kind === "resident_birthday");

    expect(birthdays).toMatchObject([
      {
        kind: "resident_birthday",
        sourceId: `resident-birthday:${resident.id}:2026`,
        homeId: home.id,
        homeName: "Sunrise",
        residentId: resident.id,
        residentName: "Birthday Today",
        birthdayDate: "2026-04-27",
      },
    ]);
  });

  it("includes birthdays within 7 days and excludes later birthdays", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Soon Birthday",
      dob: "1940-05-04",
      admissionDate: "2024-01-15",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Later Birthday",
      dob: "1940-05-05",
      admissionDate: "2024-01-15",
    });

    const names = listOpenInbox(db, adminActor, { asOfDateUtc: "2026-04-27" })
      .filter((x) => x.kind === "resident_birthday")
      .map((x) => x.residentName);

    expect(names).toEqual(["Soon Birthday"]);
  });

  it("detects upcoming birthdays across the year boundary", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "New Year Birthday",
      dob: "1940-01-02",
      admissionDate: "2024-01-15",
    });

    const birthdays = listOpenInbox(db, adminActor, {
      asOfDateUtc: "2026-12-29",
    }).filter((x) => x.kind === "resident_birthday");

    expect(birthdays).toMatchObject([
      {
        residentName: "New Year Birthday",
        birthdayDate: "2027-01-02",
      },
    ]);
  });

  it("excludes departed residents from birthday reminders", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Departed Birthday",
      dob: "1940-04-28",
      admissionDate: "2024-01-15",
    });
    departResident(db, adminActor, home.id, resident.id, {
      reason: "Moved",
      departedAtUtcMs: Date.UTC(2026, 3, 20),
    });

    const birthdays = listOpenInbox(db, adminActor, { asOfDateUtc: "2026-04-27" })
      .filter((x) => x.kind === "resident_birthday");

    expect(birthdays).toEqual([]);
  });

  it("limits birthday reminders to homes assigned to a Care user", async () => {
    const db = getDb();
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    createResident(db, adminActor, {
      homeId: homeA.id,
      fullName: "In A",
      dob: "1940-04-28",
      admissionDate: "2024-01-01",
    });
    createResident(db, adminActor, {
      homeId: homeB.id,
      fullName: "In B",
      dob: "1940-04-28",
      admissionDate: "2024-01-01",
    });
    const care = await createUser(db, "admin", {
      email: "nurse-25c@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: homeA.id,
      additionalHomeIds: [],
    });

    const names = listOpenInbox(
      db,
      { userId: care.id, role: "care" },
      { asOfDateUtc: "2026-04-27" },
    )
      .filter((x) => x.kind === "resident_birthday")
      .map((x) => x.residentName);

    expect(names).toEqual(["In A"]);
  });
});

describe("inbox filters and ranking (25d)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-tasks-25d-${randomUUID()}.sqlite`,
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

  it("orders open inbox: overdue manual before payment; urgent before normal when same due", async () => {
    const db = getDb();
    const admin = await createUser(db, "admin", {
      email: "tasks-25d-rank@example.com",
      password: STRONG,
      role: "admin",
    });
    const actor = { userId: admin.id, role: "admin" as const };
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "A" });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Payer",
      dob: "1940-05-12",
      admissionDate: "2024-01-15",
    });
    insertCharge(db, {
      residentId: r.id,
      billingMonth: "2026-04",
      amountMinor: 500_00,
    });
    createTask(db, actor, {
      homeId: home.id,
      title: "Overdue normal",
      dueDate: "2026-04-10",
      priority: "normal",
    });
    createTask(db, actor, {
      homeId: home.id,
      title: "Overdue urgent",
      dueDate: "2026-04-10",
      priority: "urgent",
    });

    const asOf = "2026-05-10";
    const ordered = listTasksForInboxQuery(
      db,
      actor,
      parseTaskInboxQuery(new URL(`http://local/?status=open&type=all`)),
      { asOfDateUtc: asOf },
    ) as { kind: string; title?: string; billingMonth?: string }[];

    const payment = ordered.find((x) => x.kind === "payment_overdue");
    const norm = ordered.find(
      (x) => x.kind === "manual" && x.title === "Overdue normal",
    );
    const urg = ordered.find(
      (x) => x.kind === "manual" && x.title === "Overdue urgent",
    );
    expect(ordered.indexOf(urg!)).toBeLessThan(ordered.indexOf(norm!));
    expect(ordered.indexOf(norm!)).toBeLessThan(ordered.indexOf(payment!));
  });

  it("filters by type and home on the open inbox", async () => {
    const db = getDb();
    const admin = await createUser(db, "admin", {
      email: "tasks-25d-filter@example.com",
      password: STRONG,
      role: "admin",
    });
    const actor = { userId: admin.id, role: "admin" as const };
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    createTask(db, actor, {
      homeId: homeA.id,
      title: "Only A",
      dueDate: "2026-06-01",
      priority: "normal",
    });
    createTask(db, actor, {
      homeId: homeB.id,
      title: "Only B",
      dueDate: "2026-06-02",
      priority: "normal",
    });
    const manualOnly = listTasksForInboxQuery(
      db,
      actor,
      parseTaskInboxQuery(
        new URL(`http://local/?status=open&type=manual&home=${homeA.id}`),
      ),
      { asOfDateUtc: "2026-04-27" },
    );
    expect(manualOnly).toHaveLength(1);
    expect(manualOnly[0]).toMatchObject({
      kind: "manual",
      homeId: homeA.id,
      title: "Only A",
    });
  });
});

describe("dashboard tasks summary (25e)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-tasks-25e-${randomUUID()}.sqlite`,
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

  it("composes payment, manual, and birthday counts (same rules as open inbox)", async () => {
    const db = getDb();
    const admin = await createUser(db, "admin", {
      email: "tasks-25e-sum@example.com",
      password: STRONG,
      role: "admin",
    });
    const actor = { userId: admin.id, role: "admin" as const };
    const home = createHome(db, "admin", {
      name: "Ridge",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, { label: "A" });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Payer",
      dob: "1940-04-12",
      admissionDate: "2024-01-15",
    });
    insertCharge(db, {
      residentId: r.id,
      billingMonth: "2026-03",
      amountMinor: 5_00,
    });
    createTask(db, actor, {
      homeId: home.id,
      title: "Due on as-of",
      dueDate: "2026-04-10",
    });
    const summary = getTasksDashboardSummary(db, actor, {
      asOfDateUtc: "2026-04-10",
    });
    expect(summary).toEqual({
      overduePayments: 1,
      manualDueOrOverdue: 1,
      birthdaysInNext7Days: 1,
    });
  });

  it("scales counts to a Care user’s assigned homes only", async () => {
    const db = getDb();
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const wA = createWard(db, adminActor, homeA.id, { label: "W" });
    const wB = createWard(db, adminActor, homeB.id, { label: "W" });
    const rA = createResident(db, adminActor, {
      homeId: homeA.id,
      fullName: "A Res",
      dob: "1940-04-28",
      admissionDate: "2024-01-01",
    });
    const rB = createResident(db, adminActor, {
      homeId: homeB.id,
      fullName: "B Res",
      dob: "1940-04-28",
      admissionDate: "2024-01-01",
    });
    insertCharge(db, {
      residentId: rA.id,
      billingMonth: "2026-03",
      amountMinor: 1_00,
    });
    insertCharge(db, {
      residentId: rB.id,
      billingMonth: "2026-03",
      amountMinor: 2_00,
    });
    const adminU = await createUser(db, "admin", {
      email: "tasks-25e-admin@example.com",
      password: STRONG,
      role: "admin",
    });
    const care = await createUser(db, "admin", {
      email: "tasks-25e-care@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: homeA.id,
      additionalHomeIds: [],
    });
    const openActor = { userId: adminU.id, role: "admin" as const };
    createTask(db, openActor, {
      homeId: homeA.id,
      title: "A task",
      dueDate: "2026-04-28",
    });
    createTask(db, openActor, {
      homeId: homeB.id,
      title: "B task",
      dueDate: "2026-04-28",
    });
    const careActor = { userId: care.id, role: "care" as const };
    const summary = getTasksDashboardSummary(db, careActor, {
      asOfDateUtc: "2026-04-28",
    });
    expect(summary).toEqual({
      overduePayments: 1,
      manualDueOrOverdue: 1,
      birthdaysInNext7Days: 1,
    });
  });

  it("excludes no-due-date, future-due, and completed manual tasks from the due/overdue count", async () => {
    const db = getDb();
    const admin = await createUser(db, "admin", {
      email: "tasks-25e-manual@example.com",
      password: STRONG,
      role: "admin",
    });
    const actor = { userId: admin.id, role: "admin" as const };
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    createTask(db, actor, { homeId: home.id, title: "No due date" });
    createTask(db, actor, {
      homeId: home.id,
      title: "Future",
      dueDate: "2026-12-01",
    });
    const t = createTask(db, actor, {
      homeId: home.id,
      title: "Complete me",
      dueDate: "2026-04-01",
    });
    completeTask(db, actor, t.id);
    const s = getTasksDashboardSummary(db, actor, { asOfDateUtc: "2026-04-15" });
    expect(s.manualDueOrOverdue).toBe(0);
  });
});
