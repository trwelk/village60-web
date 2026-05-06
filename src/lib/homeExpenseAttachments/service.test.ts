import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { homes, users } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, ValidationError } from "@/lib/homes/errors";
import { createExpenseType } from "@/lib/expenseTypes/service";
import { createHomeExpense, deleteHomeExpense } from "@/lib/homeExpenses/service";
import { count, eq } from "drizzle-orm";
import { homeExpenseAttachments } from "@/db/schema";
import {
  deleteHomeExpenseAttachment,
  listHomeExpenseAttachments,
  MAX_HOME_EXPENSE_ATTACHMENT_FILE_BYTES,
  uploadHomeExpenseAttachment,
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

const minimalPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);

describe("homeExpenseAttachments service", () => {
  const connections: Database.Database[] = [];
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    tmpDirs.length = 0;
    for (const c of connections) {
      c.close();
    }
    connections.length = 0;
  });

  it("uploads a PDF and lists it", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-exp-attach-"));
    tmpDirs.push(base);

    const tp = createExpenseType(db, adminActor, { name: "T" }, 1);
    const exp = createHomeExpense(
      db,
      adminActor,
      "h1",
      {
        expenseTypeId: tp.id,
        amountMinor: 100,
        incurredOn: "2026-05-01",
      },
      1,
    );

    const created = uploadHomeExpenseAttachment(
      db,
      adminActor,
      "h1",
      exp.id,
      {
        bytes: minimalPdf,
        declaredContentType: "application/pdf",
        originalFilename: "receipt.pdf",
      },
      2,
      base,
    );
    expect(created.contentType).toBe("application/pdf");
    expect(created.sizeBytes).toBe(minimalPdf.byteLength);

    const listed = listHomeExpenseAttachments(db, adminActor, "h1", exp.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.originalFilename).toBe("receipt.pdf");

    const diskPath = path.join(base, "h1", exp.id, `${created.id}.pdf`);
    expect(fs.existsSync(diskPath)).toBe(true);
  });

  it("rejects content that does not match allowed formats", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-exp-attach-"));
    tmpDirs.push(base);
    const tp = createExpenseType(db, adminActor, { name: "T" }, 1);
    const exp = createHomeExpense(
      db,
      adminActor,
      "h1",
      {
        expenseTypeId: tp.id,
        amountMinor: 100,
        incurredOn: "2026-05-01",
      },
      1,
    );
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() =>
      uploadHomeExpenseAttachment(
        db,
        adminActor,
        "h1",
        exp.id,
        {
          bytes: exe,
          declaredContentType: "application/octet-stream",
          originalFilename: "evil.exe",
        },
        2,
        base,
      ),
    ).toThrow(ValidationError);
  });

  it("deleteHomeExpense removes attachment rows and files", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-exp-attach-"));
    tmpDirs.push(base);
    const tp = createExpenseType(db, adminActor, { name: "T" }, 1);
    const exp = createHomeExpense(
      db,
      adminActor,
      "h1",
      {
        expenseTypeId: tp.id,
        amountMinor: 100,
        incurredOn: "2026-05-01",
      },
      1,
    );
    const created = uploadHomeExpenseAttachment(
      db,
      adminActor,
      "h1",
      exp.id,
      {
        bytes: minimalPdf,
        declaredContentType: "application/pdf",
        originalFilename: "r.pdf",
      },
      2,
      base,
    );
    const diskPath = path.join(base, "h1", exp.id, `${created.id}.pdf`);
    expect(fs.existsSync(diskPath)).toBe(true);

    process.env.EXPENSE_ATTACHMENTS_DIR = base;
    try {
      deleteHomeExpense(db, adminActor, "h1", exp.id);
    } finally {
      delete process.env.EXPENSE_ATTACHMENTS_DIR;
    }
    expect(fs.existsSync(diskPath)).toBe(false);
    const left = db
      .select({ n: count() })
      .from(homeExpenseAttachments)
      .where(eq(homeExpenseAttachments.homeExpenseId, exp.id))
      .get();
    expect(Number(left?.n ?? 0)).toBe(0);
  });

  it("rejects list for non-admin", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const tp = createExpenseType(db, adminActor, { name: "T" }, 1);
    const exp = createHomeExpense(
      db,
      adminActor,
      "h1",
      {
        expenseTypeId: tp.id,
        amountMinor: 100,
        incurredOn: "2026-05-01",
      },
      1,
    );
    expect(() =>
      listHomeExpenseAttachments(db, careActor, "h1", exp.id),
    ).toThrow(ForbiddenError);
  });

  it("rejects files over the byte cap", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-exp-attach-"));
    tmpDirs.push(base);
    const tp = createExpenseType(db, adminActor, { name: "T" }, 1);
    const exp = createHomeExpense(
      db,
      adminActor,
      "h1",
      {
        expenseTypeId: tp.id,
        amountMinor: 100,
        incurredOn: "2026-05-01",
      },
      1,
    );
    const big = new Uint8Array(MAX_HOME_EXPENSE_ATTACHMENT_FILE_BYTES + 1);
    big[0] = 0x25;
    big[1] = 0x50;
    big[2] = 0x44;
    big[3] = 0x46;
    expect(() =>
      uploadHomeExpenseAttachment(
        db,
        adminActor,
        "h1",
        exp.id,
        {
          bytes: big,
          declaredContentType: "application/pdf",
          originalFilename: "big.pdf",
        },
        2,
        base,
      ),
    ).toThrow(ValidationError);
  });

  it("deleteHomeExpenseAttachment removes one file and row", () => {
    const { db, sqlite } = openMemoryDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-exp-attach-"));
    tmpDirs.push(base);
    const tp = createExpenseType(db, adminActor, { name: "T" }, 1);
    const exp = createHomeExpense(
      db,
      adminActor,
      "h1",
      {
        expenseTypeId: tp.id,
        amountMinor: 100,
        incurredOn: "2026-05-01",
      },
      1,
    );
    const a = uploadHomeExpenseAttachment(
      db,
      adminActor,
      "h1",
      exp.id,
      {
        bytes: minimalPdf,
        declaredContentType: "application/pdf",
        originalFilename: "a.pdf",
      },
      2,
      base,
    );
    const diskPath = path.join(base, "h1", exp.id, `${a.id}.pdf`);
    deleteHomeExpenseAttachment(db, adminActor, "h1", exp.id, a.id, base);
    expect(fs.existsSync(diskPath)).toBe(false);
    expect(listHomeExpenseAttachments(db, adminActor, "h1", exp.id)).toEqual([]);
  });
});
