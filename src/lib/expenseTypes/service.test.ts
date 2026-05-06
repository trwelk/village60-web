import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { users } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { createHomeExpense, deleteHomeExpense } from "@/lib/homeExpenses/service";
import { homes } from "@/db/schema";
import {
  createExpenseType,
  deleteExpenseType,
  listExpenseTypes,
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
      name: "Fixture Home",
      defaultCurrencyCode: "USD",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  return { db, sqlite };
}

const adminActor = { userId: "u-admin", role: "admin" as const };
const careActor = { userId: "u-care", role: "care" as const };

describe("expenseTypes service", () => {
  const connections: Database.Database[] = [];

  afterEach(() => {
    for (const c of connections) {
      c.close();
    }
    connections.length = 0;
  });

  it("lists no types for an empty database when actor is admin", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    expect(listExpenseTypes(db, adminActor)).toEqual([]);
  });

  it("rejects list for non-admin", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    expect(() => listExpenseTypes(db, careActor)).toThrow(ForbiddenError);
  });

  it("creates a type and returns it ordered by name", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t0 = createExpenseType(db, adminActor, { name: "  Food  " }, 1000);
    expect(t0.name).toBe("Food");
    expect(t0.createdAtUtcMs).toBe(1000);
    const t1 = createExpenseType(db, adminActor, { name: "Electricity" }, 2000);
    const rows = listExpenseTypes(db, adminActor);
    expect(rows.map((r) => r.name)).toEqual(["Electricity", "Food"]);
    expect(rows.find((r) => r.id === t1.id)?.createdByUserId).toBe("u-admin");
  });

  it("rejects duplicate names case-insensitively after trim", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    createExpenseType(db, adminActor, { name: "Food" }, 1);
    expect(() =>
      createExpenseType(db, adminActor, { name: "  food " }, 2),
    ).toThrow(ValidationError);
  });

  it("rejects empty name", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    expect(() =>
      createExpenseType(db, adminActor, { name: "   " }, 1),
    ).toThrow(ValidationError);
  });

  it("deletes an existing type", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t = createExpenseType(db, adminActor, { name: "X" }, 1);
    deleteExpenseType(db, adminActor, t.id);
    expect(listExpenseTypes(db, adminActor)).toEqual([]);
  });

  it("delete returns not found for unknown id", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    expect(() =>
      deleteExpenseType(db, adminActor, "00000000-0000-4000-8000-000000000001"),
    ).toThrow(NotFoundError);
  });

  it("delete is blocked when a home expense references the type", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const t = createExpenseType(db, adminActor, { name: "Used" }, 1);
    createHomeExpense(
      db,
      adminActor,
      "h1",
      {
        expenseTypeId: t.id,
        amountMinor: 100,
        incurredOn: "2026-03-01",
      },
      1,
    );
    expect(() => deleteExpenseType(db, adminActor, t.id)).toThrow(ValidationError);
    deleteHomeExpense(
      db,
      adminActor,
      "h1",
      db
        .select({ id: schema.homeExpenses.id })
        .from(schema.homeExpenses)
        .get()!.id,
    );
    deleteExpenseType(db, adminActor, t.id);
    expect(listExpenseTypes(db, adminActor)).toEqual([]);
  });
});
