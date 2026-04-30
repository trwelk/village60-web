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
import { users } from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { createHome } from "@/lib/homes/service";
import { verifyPassword } from "@/lib/iam/password";
import {
  createUser,
  listUsersWithAssignments,
  resetUserPassword,
  setCareUserHomeAssignments,
  updateOwnPassword,
} from "./service";

const STRONG = "ChangeMeNow!1";

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("staff users (admin vs care)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-users-${randomUUID()}.sqlite`);
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

  it("does not let a Care user create users", async () => {
    const db = getDb();
    await expect(
      createUser(db, "care", {
        email: "new@example.com",
        password: STRONG,
        role: "admin",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("does not let an unauthenticated caller create users", async () => {
    const db = getDb();
    await expect(
      createUser(db, undefined, {
        email: "new@example.com",
        password: STRONG,
        role: "admin",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets an Admin create another Admin with a compliant password", async () => {
    const db = getDb();
    const u = await createUser(db, "admin", {
      email: "  Other@Example.COM ",
      password: STRONG,
      role: "admin",
    });
    expect(u.email).toBe("other@example.com");
    expect(u.role).toBe("admin");
    expect(u.primaryHomeId).toBeNull();
    expect(u.additionalHomeIds).toEqual([]);
    const row = db.select().from(users).where(eq(users.id, u.id)).get();
    expect(row).toBeDefined();
    expect(await verifyPassword(STRONG, row!.passwordHash)).toBe(true);
  });

  it("blocks duplicate email on create", async () => {
    const db = getDb();
    await createUser(db, "admin", {
      email: "dup@example.com",
      password: STRONG,
      role: "admin",
    });
    await expect(
      createUser(db, "admin", {
        email: "dup@example.com",
        password: STRONG,
        role: "admin",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects passwords that do not meet policy", async () => {
    const db = getDb();
    await expect(
      createUser(db, "admin", {
        email: "weak@example.com",
        password: "short",
        role: "admin",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("lets an Admin create a Care user with primary and additional homes", async () => {
    const db = getDb();
    const a = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const b = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const c = createHome(db, "admin", {
      name: "C",
      defaultCurrencyCode: "NZD",
    });
    const u = await createUser(db, "admin", {
      email: "nurse@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: a.id,
      additionalHomeIds: [c.id, b.id, b.id],
    });
    expect(u.primaryHomeId).toBe(a.id);
    expect(u.additionalHomeIds).toEqual([b.id, c.id].sort());
  });

  it("rejects unknown home ids for Care assignments", async () => {
    const db = getDb();
    const a = createHome(db, "admin", {
      name: "Only",
      defaultCurrencyCode: "NZD",
    });
    await expect(
      createUser(db, "admin", {
        email: "bad@example.com",
        password: STRONG,
        role: "care",
        primaryHomeId: a.id,
        additionalHomeIds: [randomUUID()],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("lets an Admin reset another user's password", async () => {
    const db = getDb();
    const u = await createUser(db, "admin", {
      email: "target@example.com",
      password: STRONG,
      role: "admin",
    });
    const next = "AnotherGood!9Pwd";
    await resetUserPassword(db, "admin", u.id, next);
    const row = db.select().from(users).where(eq(users.id, u.id)).get();
    expect(await verifyPassword(next, row!.passwordHash)).toBe(true);
    expect(row!.failureTimestampsUtcMs).toBe("[]");
    expect(row!.lockedUntilUtcMs).toBeNull();
  });

  it("lets a user change their own password when the current password is correct", async () => {
    const db = getDb();
    const u = await createUser(db, "admin", {
      email: "self@example.com",
      password: STRONG,
      role: "admin",
    });
    const next = "SelfServeGood!2";
    await updateOwnPassword(db, u.id, STRONG, next);
    const row = db.select().from(users).where(eq(users.id, u.id)).get();
    expect(await verifyPassword(next, row!.passwordHash)).toBe(true);
  });

  it("rejects change-password when the current password is wrong", async () => {
    const db = getDb();
    const u = await createUser(db, "admin", {
      email: "x@example.com",
      password: STRONG,
      role: "admin",
    });
    await expect(
      updateOwnPassword(db, u.id, "WrongPass!99", "NewerGood!3Pass"),
    ).rejects.toThrow(ValidationError);
  });

  it("lists users with assignments for Admin only", async () => {
    const db = getDb();
    const h = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    await createUser(db, "admin", {
      email: "list@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: h.id,
    });
    const list = listUsersWithAssignments(db, "admin");
    expect(list.some((x) => x.email === "list@example.com")).toBe(true);
    expect(() => listUsersWithAssignments(db, "care")).toThrow(ForbiddenError);
  });

  it("updates Care home assignments with integrity checks", async () => {
    const db = getDb();
    const h1 = createHome(db, "admin", {
      name: "H1",
      defaultCurrencyCode: "NZD",
    });
    const h2 = createHome(db, "admin", {
      name: "H2",
      defaultCurrencyCode: "NZD",
    });
    const u = await createUser(db, "admin", {
      email: "float@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: h1.id,
    });
    const updated = setCareUserHomeAssignments(db, "admin", u.id, {
      primaryHomeId: h2.id,
      additionalHomeIds: [h1.id],
    });
    expect(updated.primaryHomeId).toBe(h2.id);
    expect(updated.additionalHomeIds).toEqual([h1.id]);
    expect(() =>
      setCareUserHomeAssignments(db, "admin", u.id, {
        primaryHomeId: h2.id,
        additionalHomeIds: [randomUUID()],
      }),
    ).toThrow(ValidationError);
  });

  it("returns not found when resetting password for a missing user", async () => {
    const db = getDb();
    await expect(
      resetUserPassword(db, "admin", randomUUID(), STRONG),
    ).rejects.toThrow(NotFoundError);
  });
});
