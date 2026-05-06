import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { homes, users } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { createExpenseType } from "@/lib/expenseTypes/service";
import {
  clampHomeExpensePageSize,
  createHomeExpense,
  DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
  deleteHomeExpense,
  listHomeExpensesLedger,
  parsePaymentStatus,
  resolveHomeExpenseIncurredRange,
  updateHomeExpense,
} from "./service";

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
      name: "Test Home",
      defaultCurrencyCode: "USD",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  return { db, sqlite };
}

const adminActor = { userId: "u-admin", role: "admin" as const };
const careActor = { userId: "u-care", role: "care" as const };

describe("homeExpenses service", () => {
  const connections: Database.Database[] = [];

  afterEach(() => {
    for (const c of connections) {
      c.close();
    }
    connections.length = 0;
  });

  it("lists zero rows with empty summary for admin and valid home within YTD", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const y2026 = Date.UTC(2026, 6, 15);
    const range = resolveHomeExpenseIncurredRange(undefined, undefined, y2026);
    expect(range.isDefaultYtd).toBe(true);
    expect(range.incurredFrom).toBe("2026-01-01");

    const res = listHomeExpensesLedger(db, adminActor, "h1", {
      incurredFrom: range.incurredFrom,
      incurredTo: range.incurredTo,
      paymentStatus: "all",
      expenseTypeId: null,
      page: 1,
      pageSize: DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
    });
    expect(res.rows).toEqual([]);
    expect(res.totalCount).toBe(0);
    expect(res.summary.grandTotalMinor).toBe(0);
    expect(res.summary.breakdown).toEqual([]);
  });

  it("rejects list for non-admin", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const range = resolveHomeExpenseIncurredRange(undefined, undefined, Date.UTC(2026, 0, 10));
    expect(() =>
      listHomeExpensesLedger(db, careActor, "h1", {
        incurredFrom: range.incurredFrom,
        incurredTo: range.incurredTo,
        paymentStatus: "all",
        expenseTypeId: null,
        page: 1,
        pageSize: DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
      }),
    ).toThrow(ForbiddenError);
  });

  it("creates and lists expense with unpaid filter and summaries", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const food = createExpenseType(db, adminActor, { name: "Food" }, 1);
    createHomeExpense(db, adminActor, "h1", {
      expenseTypeId: food.id,
      amountMinor: 1200,
      incurredOn: "2026-05-03",
      paidOn: null,
      vendor: "Acme Foods",
      note: null,
    }, 999);

    const range = resolveHomeExpenseIncurredRange(undefined, undefined, Date.UTC(2026, 4, 3));
    const all = listHomeExpensesLedger(db, adminActor, "h1", {
      incurredFrom: range.incurredFrom,
      incurredTo: range.incurredTo,
      paymentStatus: "all",
      expenseTypeId: null,
      page: 1,
      pageSize: DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
    });
    expect(all.totalCount).toBe(1);
    expect(all.summary.grandTotalMinor).toBe(1200);
    expect(all.summary.breakdown).toEqual([
      { expenseTypeId: food.id, name: "Food", totalMinor: 1200 },
    ]);

    const unpaid = listHomeExpensesLedger(db, adminActor, "h1", {
      ...range,
      paymentStatus: "unpaid",
      expenseTypeId: null,
      page: 1,
      pageSize: DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
    });
    expect(unpaid.totalCount).toBe(1);

    const paid = listHomeExpensesLedger(db, adminActor, "h1", {
      ...range,
      paymentStatus: "paid",
      expenseTypeId: null,
      page: 1,
      pageSize: DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
    });
    expect(paid.totalCount).toBe(0);
    expect(paid.summary.grandTotalMinor).toBe(0);

    createHomeExpense(
      db,
      adminActor,
      "h1",
      {
        expenseTypeId: food.id,
        amountMinor: 500,
        incurredOn: "2026-05-03",
        paidOn: "2026-05-03",
      },
      1000,
    );

    const paid2 = listHomeExpensesLedger(db, adminActor, "h1", {
      ...range,
      paymentStatus: "paid",
      expenseTypeId: null,
      page: 1,
      pageSize: DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
    });
    expect(paid2.totalCount).toBe(1);
    expect(paid2.summary.grandTotalMinor).toBe(500);
    expect(all.rows.every((r) => r.incurredOn === "2026-05-03")).toBe(true);

    const byType = listHomeExpensesLedger(db, adminActor, "h1", {
      incurredFrom: range.incurredFrom,
      incurredTo: range.incurredTo,
      paymentStatus: "all",
      expenseTypeId: food.id,
      page: 1,
      pageSize: DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
    });
    expect(byType.totalCount).toBe(2);
  });

  it("rejects paid_on before incurred_on on create", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t = createExpenseType(db, adminActor, { name: "Fuel" }, 1);
    expect(() =>
      createHomeExpense(db, adminActor, "h1", {
        expenseTypeId: t.id,
        amountMinor: 100,
        incurredOn: "2026-05-03",
        paidOn: "2026-05-02",
      }, 9),
    ).toThrow(ValidationError);
  });

  it("summaries aggregate full filtered set across pages while rows are paged", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const tp = createExpenseType(db, adminActor, { name: "T" }, 1);
    for (let i = 1; i <= 3; i++) {
      createHomeExpense(
        db,
        adminActor,
        "h1",
        {
          expenseTypeId: tp.id,
          amountMinor: 100 * i,
          incurredOn: `2026-05-${String(i).padStart(2, "0")}`,
        },
        100 + i,
      );
    }
    const range = resolveHomeExpenseIncurredRange(undefined, undefined, Date.UTC(2026, 4, 10));
    const p1 = listHomeExpensesLedger(db, adminActor, "h1", {
      ...range,
      paymentStatus: "all",
      expenseTypeId: null,
      page: 1,
      pageSize: 2,
    });
    expect(p1.rows).toHaveLength(2);
    expect(p1.totalCount).toBe(3);
    expect(p1.summary.grandTotalMinor).toBe(600);

    const p2 = listHomeExpensesLedger(db, adminActor, "h1", {
      ...range,
      paymentStatus: "all",
      expenseTypeId: null,
      page: 2,
      pageSize: 2,
    });
    expect(p2.rows).toHaveLength(1);
    expect(p2.summary.grandTotalMinor).toBe(600);
  });

  it("updates and deletes a row", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const tp = createExpenseType(db, adminActor, { name: "X" }, 1);
    const created = createHomeExpense(
      db,
      adminActor,
      "h1",
      {
        expenseTypeId: tp.id,
        amountMinor: 200,
        incurredOn: "2026-02-10",
        note: "old",
      },
      1,
    );
    const updated = updateHomeExpense(
      db,
      adminActor,
      "h1",
      created.id,
      { amountMinor: 300, note: "new" },
      2,
    );
    expect(updated.amountMinor).toBe(300);
    expect(updated.note).toBe("new");

    deleteHomeExpense(db, adminActor, "h1", created.id);
    const range = resolveHomeExpenseIncurredRange("2026-01-01", "2026-12-31", Date.UTC(2026, 0, 1));
    const res = listHomeExpensesLedger(db, adminActor, "h1", {
      incurredFrom: range.incurredFrom,
      incurredTo: range.incurredTo,
      paymentStatus: "all",
      expenseTypeId: null,
      page: 1,
      pageSize: 50,
    });
    expect(res.totalCount).toBe(0);
  });

  it("returns not found when home id is unknown", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const range = resolveHomeExpenseIncurredRange(undefined, undefined, Date.UTC(2026, 0, 1));
    expect(() =>
      listHomeExpensesLedger(db, adminActor, "no-home", {
        incurredFrom: range.incurredFrom,
        incurredTo: range.incurredTo,
        paymentStatus: "all",
        expenseTypeId: null,
        page: 1,
        pageSize: 50,
      }),
    ).toThrow(NotFoundError);
  });

  it("resolveHomeExpenseIncurredRange rejects partial custom range", () => {
    expect(() =>
      resolveHomeExpenseIncurredRange("2026-01-01", "", Date.now()),
    ).toThrow(ValidationError);
  });

  it("parsePaymentStatus flags invalid params", () => {
    expect(parsePaymentStatus("zebra").hadInvalid).toBe(true);
    expect(parsePaymentStatus("paid").paymentStatus).toBe("paid");
  });

  it("clampHomeExpensePageSize caps at ledger max", () => {
    expect(clampHomeExpensePageSize(9999)).toBe(100);
  });
});
