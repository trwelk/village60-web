import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { createUser } from "@/lib/users/service";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import {
  createHome,
  listHomes,
  listHomesPage,
  MAX_HOMES_PAGE_SIZE,
  updateHome,
} from "./service";

const STRONG = "ChangeMeNow!1";
const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("homes directory (admin vs care)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-homes-${randomUUID()}.sqlite`);
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

  it("lets an Admin create a retirement home with default currency", () => {
    const db = getDb();
    const row = createHome(db, "admin", {
      name: "  Sunrise Villa  ",
      defaultCurrencyCode: "lkr",
    });
    expect(row.name).toBe("Sunrise Villa");
    expect(row.defaultCurrencyCode).toBe("LKR");
    expect(row.archivedAtUtcMs).toBeNull();
  });

  it("does not let a Care user create a home", () => {
    const db = getDb();
    expect(() =>
      createHome(db, "care", {
        name: "X",
        defaultCurrencyCode: "USD",
      }),
    ).toThrow(ForbiddenError);
  });

  it("does not let an unauthenticated caller create a home", () => {
    const db = getDb();
    expect(() =>
      createHome(db, undefined, {
        name: "X",
        defaultCurrencyCode: "USD",
      }),
    ).toThrow(ForbiddenError);
  });

  it("lets an Admin list homes in name order", () => {
    const db = getDb();
    createHome(db, "admin", { name: "Beta", defaultCurrencyCode: "USD" });
    createHome(db, "admin", { name: "Alpha", defaultCurrencyCode: "GBP" });
    expect(listHomes(db, adminActor).map((h) => h.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("lets a Care user list only assigned homes", async () => {
    const db = getDb();
    const a = createHome(db, "admin", { name: "A", defaultCurrencyCode: "USD" });
    const b = createHome(db, "admin", { name: "B", defaultCurrencyCode: "USD" });
    const c = createHome(db, "admin", { name: "C", defaultCurrencyCode: "USD" });
    const care = await createUser(db, "admin", {
      email: "care-list@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: a.id,
      additionalHomeIds: [c.id],
    });
    const listed = listHomes(db, { userId: care.id, role: "care" });
    expect(listed.map((h) => h.name)).toEqual(["A", "C"]);
    expect(new Set(listed.map((h) => h.id))).toEqual(new Set([a.id, c.id]));
    expect(listed.some((h) => h.id === b.id)).toBe(false);
  });

  it("does not let an unauthenticated caller list homes", () => {
    const db = getDb();
    createHome(db, "admin", { name: "Only", defaultCurrencyCode: "USD" });
    expect(() => listHomes(db, undefined)).toThrow(ForbiddenError);
  });

  it("lets an Admin update name, currency, and archive state", () => {
    const db = getDb();
    const h = createHome(db, "admin", {
      name: "Before",
      defaultCurrencyCode: "USD",
    });
    const updated = updateHome(db, "admin", h.id, {
      name: "After",
      defaultCurrencyCode: "eur",
      archived: true,
    });
    expect(updated.name).toBe("After");
    expect(updated.defaultCurrencyCode).toBe("EUR");
    expect(updated.archivedAtUtcMs).not.toBeNull();

    const restored = updateHome(db, "admin", h.id, { archived: false });
    expect(restored.archivedAtUtcMs).toBeNull();
  });

  it("does not let a Care user update a home", () => {
    const db = getDb();
    const h = createHome(db, "admin", {
      name: "X",
      defaultCurrencyCode: "USD",
    });
    expect(() => updateHome(db, "care", h.id, { name: "Y" })).toThrow(
      ForbiddenError,
    );
  });

  it("rejects invalid currency codes", () => {
    const db = getDb();
    expect(() =>
      createHome(db, "admin", { name: "X", defaultCurrencyCode: "US" }),
    ).toThrow(ValidationError);
  });

  it("returns not found when updating a missing home", () => {
    const db = getDb();
    expect(() =>
      updateHome(db, "admin", randomUUID(), { name: "Nope" }),
    ).toThrow(NotFoundError);
  });
});

describe("listHomesPage (paged directory)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-homes-page-${randomUUID()}.sqlite`,
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

  it("returns a page of homes for Admin with stable name order and id tie-break, totalCount, and next page", () => {
    const db = getDb();
    const g = createHome(db, "admin", { name: "Gamma", defaultCurrencyCode: "USD" });
    const a = createHome(db, "admin", { name: "Alpha", defaultCurrencyCode: "USD" });
    const b = createHome(db, "admin", { name: "Beta", defaultCurrencyCode: "USD" });
    const p1 = listHomesPage(db, adminActor, { page: 1, pageSize: 2 });
    expect(p1.totalCount).toBe(3);
    expect(p1.page).toBe(1);
    expect(p1.pageSize).toBe(2);
    expect(p1.rows.map((h) => h.id)).toEqual([a.id, b.id]);
    const p2 = listHomesPage(db, adminActor, { page: 2, pageSize: 2 });
    expect(p2.totalCount).toBe(3);
    expect(p2.rows.map((h) => h.id)).toEqual([g.id]);
  });

  it("lets Care list only assigned homes with matching totalCount and empty page when out of range", async () => {
    const db = getDb();
    const z = createHome(db, "admin", { name: "Z", defaultCurrencyCode: "USD" });
    createHome(db, "admin", { name: "A", defaultCurrencyCode: "USD" });
    const m = createHome(db, "admin", { name: "M", defaultCurrencyCode: "USD" });
    const care = await createUser(db, "admin", {
      email: "care-page@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: z.id,
      additionalHomeIds: [m.id],
    });
    const actor = { userId: care.id, role: "care" as const };
    const p1 = listHomesPage(db, actor, { page: 1, pageSize: 1 });
    expect(p1.totalCount).toBe(2);
    expect(p1.rows.map((h) => h.name)).toEqual(["M"]);
    const p2 = listHomesPage(db, actor, { page: 2, pageSize: 1 });
    expect(p2.rows.map((h) => h.name)).toEqual(["Z"]);
    const empty = listHomesPage(db, actor, { page: 9, pageSize: 1 });
    expect(empty.rows).toEqual([]);
    expect(empty.totalCount).toBe(2);
  });

  it("caps pageSize at the maximum", () => {
    const db = getDb();
    for (let i = 0; i < 3; i++) {
      createHome(db, "admin", {
        name: `H${i}`,
        defaultCurrencyCode: "USD",
      });
    }
    const out = listHomesPage(db, adminActor, {
      page: 1,
      pageSize: 9999,
    });
    expect(out.pageSize).toBe(MAX_HOMES_PAGE_SIZE);
    expect(out.rows.length).toBeLessThanOrEqual(MAX_HOMES_PAGE_SIZE);
  });
});
