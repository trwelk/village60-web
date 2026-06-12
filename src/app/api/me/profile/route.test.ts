import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sealData } from "iron-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { users } from "@/db/schema";
import { GET, PATCH } from "./route";

const SESSION_PASSWORD = "a".repeat(32);
const SESSION_TTL = 30 * 60;

const cookieState = vi.hoisted(() => ({ seal: "" as string }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "village60_session" && cookieState.seal
        ? { name, value: cookieState.seal }
        : undefined,
  }),
}));

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("GET /api/me/profile", () => {
  let dbPath: string;

  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", SESSION_PASSWORD);
    vi.stubEnv("NODE_ENV", "test");
    cookieState.seal = "";
    dbPath = path.join(os.tmpdir(), `village60-profile-api-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    vi.unstubAllEnvs();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("returns 401 when there is no session", async () => {
    process.env.DATABASE_PATH = dbPath;
    const res = await GET();
    expect(res.status).toBe(401);
    closeDbConnection();
  });

  it("returns 200 with profile keys for an authenticated user", async () => {
    process.env.DATABASE_PATH = dbPath;
    const db = getDb();
    const userId = randomUUID();
    db.insert(users)
      .values({
        id: userId,
        email: "profile-api@example.com",
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: Date.now(),
        primaryHomeId: null,
        displayName: "Pat Example",
        phone: null,
        avatarUrl: null,
      })
      .run();
    closeDbConnection();

    cookieState.seal = await sealData(
      {
        userId,
        email: "profile-api@example.com",
        role: "admin",
      },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    process.env.DATABASE_PATH = dbPath;
    const res = await GET();
    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).toMatchObject({
      email: "profile-api@example.com",
      role: "admin",
      displayName: "Pat Example",
      phone: null,
      avatarUrl: null,
      preferredLocale: "en",
    });
    closeDbConnection();
  });
});

describe("PATCH /api/me/profile", () => {
  let dbPath: string;

  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", SESSION_PASSWORD);
    vi.stubEnv("NODE_ENV", "test");
    cookieState.seal = "";
    dbPath = path.join(
      os.tmpdir(),
      `village60-profile-patch-${randomUUID()}.sqlite`,
    );
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    vi.unstubAllEnvs();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("returns 401 when there is no session", async () => {
    process.env.DATABASE_PATH = dbPath;
    const res = await PATCH(
      new Request("http://local/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "X" }),
      }),
    );
    expect(res.status).toBe(401);
    closeDbConnection();
  });

  it("returns 200 and updated profile for an authenticated user", async () => {
    process.env.DATABASE_PATH = dbPath;
    const db = getDb();
    const userId = randomUUID();
    db.insert(users)
      .values({
        id: userId,
        email: "patch-profile@example.com",
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: Date.now(),
        primaryHomeId: null,
        displayName: "Old",
        phone: null,
        avatarUrl: null,
      })
      .run();
    closeDbConnection();

    cookieState.seal = await sealData(
      {
        userId,
        email: "patch-profile@example.com",
        role: "admin",
      },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    process.env.DATABASE_PATH = dbPath;
    const res = await PATCH(
      new Request("http://local/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "  Pat Updated  ",
          phone: "+1 234 567 8900",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).toMatchObject({
      email: "patch-profile@example.com",
      role: "admin",
      displayName: "Pat Updated",
      phone: "+1 234 567 8900",
      avatarUrl: null,
      preferredLocale: "en",
    });
    closeDbConnection();
  });

  it("returns 200 when preferred locale is updated", async () => {
    process.env.DATABASE_PATH = dbPath;
    const db = getDb();
    const userId = randomUUID();
    db.insert(users)
      .values({
        id: userId,
        email: "locale@example.com",
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: Date.now(),
        primaryHomeId: null,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    closeDbConnection();

    cookieState.seal = await sealData(
      {
        userId,
        email: "locale@example.com",
        role: "admin",
      },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    process.env.DATABASE_PATH = dbPath;
    const res = await PATCH(
      new Request("http://local/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLocale: "ta" }),
      }),
    );
    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).toMatchObject({ preferredLocale: "ta" });
    closeDbConnection();
  });

  it("returns 400 when preferred locale is invalid", async () => {
    process.env.DATABASE_PATH = dbPath;
    const db = getDb();
    const userId = randomUUID();
    db.insert(users)
      .values({
        id: userId,
        email: "bad-locale@example.com",
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: Date.now(),
        primaryHomeId: null,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    closeDbConnection();

    cookieState.seal = await sealData(
      {
        userId,
        email: "bad-locale@example.com",
        role: "admin",
      },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    process.env.DATABASE_PATH = dbPath;
    const res = await PATCH(
      new Request("http://local/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLocale: "fr" }),
      }),
    );
    expect(res.status).toBe(400);
    closeDbConnection();
  });

  it("returns 400 when display name is too long", async () => {
    process.env.DATABASE_PATH = dbPath;
    const db = getDb();
    const userId = randomUUID();
    db.insert(users)
      .values({
        id: userId,
        email: "long-name@example.com",
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: Date.now(),
        primaryHomeId: null,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    closeDbConnection();

    cookieState.seal = await sealData(
      {
        userId,
        email: "long-name@example.com",
        role: "admin",
      },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    process.env.DATABASE_PATH = dbPath;
    const res = await PATCH(
      new Request("http://local/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "x".repeat(201) }),
      }),
    );
    expect(res.status).toBe(400);
    const json: unknown = await res.json();
    expect(
      typeof json === "object" &&
        json !== null &&
        "error" in json &&
        typeof (json as { error: string }).error === "string",
    ).toBe(true);
    closeDbConnection();
  });
});
