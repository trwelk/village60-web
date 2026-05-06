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
import { homes, users } from "@/db/schema";
import { createResident, departResident } from "@/lib/residents/service";
import { DELETE as DELETEPhoto, GET as GETPhoto, POST as POSTPhoto } from "./route";

const SESSION_PASSWORD = "c".repeat(32);
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

const tinyJpegBody = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("resident portrait API", () => {
  let dbPath: string;
  let portraitDir: string;

  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", SESSION_PASSWORD);
    vi.stubEnv("NODE_ENV", "test");
    cookieState.seal = "";
    dbPath = path.join(os.tmpdir(), `v60-portrait-api-${randomUUID()}.sqlite`);
    portraitDir = fs.mkdtempSync(path.join(os.tmpdir(), "v60-portrait-api-fs-"));
    vi.stubEnv("RESIDENT_PORTRAITS_DIR", portraitDir);
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
    try {
      fs.rmSync(portraitDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  async function seedAdminHomeResident(adminId: string): Promise<string> {
    const db = getDb();
    const t = Date.now();
    db.insert(users)
      .values({
        id: adminId,
        email: `admin-portrait-api-${adminId}@example.com`,
        passwordHash: "x",
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t,
        primaryHomeId: null,
        displayName: null,
        phone: null,
        avatarUrl: null,
      })
      .run();
    db.insert(homes)
      .values({
        id: "h1",
        name: "Home One",
        defaultCurrencyCode: "USD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    const r = createResident(db, { userId: adminId, role: "admin" }, {
      homeId: "h1",
      fullName: "Api Face",
      dob: "1944-05-05",
      admissionDate: "2021-01-01",
    });
    closeDbConnection();
    return r.id;
  }

  it("uploads, downloads, and deletes portrait for admin", async () => {
    const adminId = randomUUID();
    const residentId = await seedAdminHomeResident(adminId);
    cookieState.seal = await sealData(
      { userId: adminId, email: "a@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const blob = new Blob([tinyJpegBody], { type: "image/jpeg" });
    const fd = new FormData();
    fd.set("file", blob, "p.jpg");

    const postRes = await POSTPhoto(
      new Request("http://localhost", { method: "POST", body: fd }),
      { params: Promise.resolve({ id: "h1", residentId }) },
    );
    expect(postRes.status).toBe(201);
    const postJson = (await postRes.json()) as { portraitUpdatedAtUtcMs: number };
    expect(typeof postJson.portraitUpdatedAtUtcMs).toBe("number");

    const getRes = await GETPhoto(new Request("http://localhost"), {
      params: Promise.resolve({ id: "h1", residentId }),
    });
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("Content-Type")).toBe("image/jpeg");
    expect(getRes.headers.get("Cache-Control")).toBe("private, no-store");
    const buf = new Uint8Array(await getRes.arrayBuffer());
    expect(buf).toEqual(tinyJpegBody);

    const delRes = await DELETEPhoto(new Request("http://localhost"), {
      params: Promise.resolve({ id: "h1", residentId }),
    });
    expect(delRes.status).toBe(204);

    const get404 = await GETPhoto(new Request("http://localhost"), {
      params: Promise.resolve({ id: "h1", residentId }),
    });
    expect(get404.status).toBe(404);
  });

  it("returns 403 when uploading portrait for a departed resident", async () => {
    const adminId = randomUUID();
    const residentId = await seedAdminHomeResident(adminId);
    cookieState.seal = await sealData(
      { userId: adminId, email: "a@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const db = getDb();
    departResident(db, { userId: adminId, role: "admin" }, "h1", residentId, {
      reason: "Left",
      departedAtUtcMs: 999,
    });
    closeDbConnection();

    const blob = new Blob([tinyJpegBody], { type: "image/jpeg" });
    const fd = new FormData();
    fd.set("file", blob, "p.jpg");

    const postRes = await POSTPhoto(
      new Request("http://localhost", { method: "POST", body: fd }),
      { params: Promise.resolve({ id: "h1", residentId }) },
    );
    expect(postRes.status).toBe(403);
  });
});
