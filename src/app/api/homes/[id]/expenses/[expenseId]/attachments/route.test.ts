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
import { createExpenseType } from "@/lib/expenseTypes/service";
import { createHomeExpense } from "@/lib/homeExpenses/service";
import { GET as GETAttachmentFile } from "./[attachmentId]/route";
import { GET as GETAttachmentList, POST as POSTAttachmentUpload } from "./route";

const SESSION_PASSWORD = "b".repeat(32);
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

describe("home expense attachments API", () => {
  let dbPath: string;
  let attachDir: string;

  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", SESSION_PASSWORD);
    vi.stubEnv("NODE_ENV", "test");
    cookieState.seal = "";
    dbPath = path.join(os.tmpdir(), `v60-exp-api-${randomUUID()}.sqlite`);
    attachDir = fs.mkdtempSync(path.join(os.tmpdir(), "v60-exp-api-att-"));
    vi.stubEnv("EXPENSE_ATTACHMENTS_DIR", attachDir);
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
      fs.rmSync(attachDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  async function seedLedger(adminId: string, careId: string) {
    const db = getDb();
    const t = Date.now();
    db.insert(users)
      .values([
        {
          id: adminId,
          email: "admin-exp-att@example.com",
          passwordHash: "x",
          role: "admin",
          failureTimestampsUtcMs: "[]",
          lockedUntilUtcMs: null,
          createdAtUtcMs: t,
          primaryHomeId: null,
          displayName: null,
          phone: null,
          avatarUrl: null,
        },
        {
          id: careId,
          email: "care-exp-att@example.com",
          passwordHash: "x",
          role: "care",
          failureTimestampsUtcMs: "[]",
          lockedUntilUtcMs: null,
          createdAtUtcMs: t,
          primaryHomeId: null,
          displayName: null,
          phone: null,
          avatarUrl: null,
        },
      ])
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
    const tp = createExpenseType(db, { userId: adminId, role: "admin" }, { name: "Fuel" }, t);
    const exp = createHomeExpense(
      db,
      { userId: adminId, role: "admin" },
      "h1",
      {
        expenseTypeId: tp.id,
        amountMinor: 500,
        incurredOn: "2026-03-01",
      },
      t,
    );
    closeDbConnection();
    return exp.id;
  }

  it("returns 403 on upload for non-admin", async () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const expenseId = await seedLedger(adminId, careId);
    cookieState.seal = await sealData(
      { userId: careId, email: "care@example.com", role: "care" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const blob = new Blob([pdf], { type: "application/pdf" });
    const fd = new FormData();
    fd.set("file", blob, "x.pdf");

    const res = await POSTAttachmentUpload(
      new Request("http://localhost", { method: "POST", body: fd }),
      { params: Promise.resolve({ id: "h1", expenseId }) },
    );
    expect(res.status).toBe(403);
  });

  it("uploads and downloads for admin", async () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const expenseId = await seedLedger(adminId, careId);
    cookieState.seal = await sealData(
      { userId: adminId, email: "admin@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const blob = new Blob([pdf], { type: "application/pdf" });
    const fd = new FormData();
    fd.set("file", blob, "invoice.pdf");

    const postRes = await POSTAttachmentUpload(
      new Request("http://localhost", { method: "POST", body: fd }),
      { params: Promise.resolve({ id: "h1", expenseId }) },
    );
    expect(postRes.status).toBe(201);
    const body = (await postRes.json()) as { attachment: { id: string } };
    const attachmentId = body.attachment.id;

    const listRes = await GETAttachmentList(
      new Request("http://localhost"),
      { params: Promise.resolve({ id: "h1", expenseId }) },
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { attachments: unknown[] };
    expect(listJson.attachments).toHaveLength(1);

    const getRes = await GETAttachmentFile(
      new Request("http://localhost"),
      {
        params: Promise.resolve({
          id: "h1",
          expenseId,
          attachmentId,
        }),
      },
    );
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("Content-Type")).toBe("application/pdf");
    const dl = new Uint8Array(await getRes.arrayBuffer());
    expect(dl[0]).toBe(0x25);
    expect(dl[1]).toBe(0x50);
  });

  it("returns 403 on download for non-admin", async () => {
    const adminId = randomUUID();
    const careId = randomUUID();
    const expenseId = await seedLedger(adminId, careId);
    cookieState.seal = await sealData(
      { userId: adminId, email: "admin@example.com", role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );
    process.env.DATABASE_PATH = dbPath;

    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const blob = new Blob([pdf], { type: "application/pdf" });
    const fd = new FormData();
    fd.set("file", blob, "a.pdf");
    const postRes = await POSTAttachmentUpload(
      new Request("http://localhost", { method: "POST", body: fd }),
      { params: Promise.resolve({ id: "h1", expenseId }) },
    );
    const body = (await postRes.json()) as { attachment: { id: string } };
    const attachmentId = body.attachment.id;

    cookieState.seal = await sealData(
      { userId: careId, email: "care@example.com", role: "care" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const getRes = await GETAttachmentFile(
      new Request("http://localhost"),
      {
        params: Promise.resolve({
          id: "h1",
          expenseId,
          attachmentId,
        }),
      },
    );
    expect(getRes.status).toBe(403);
  });
});
