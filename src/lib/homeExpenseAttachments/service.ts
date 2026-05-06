import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, count, eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { homeExpenseAttachments, homeExpenses, homes } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import {
  fileExtensionForExpenseAttachmentKind,
  validateExpenseAttachmentContent,
} from "./sniff";
import {
  MAX_HOME_EXPENSE_ATTACHMENT_FILE_BYTES,
  MAX_HOME_EXPENSE_ATTACHMENTS_PER_EXPENSE,
} from "./caps";

export {
  MAX_HOME_EXPENSE_ATTACHMENT_FILE_BYTES,
  MAX_HOME_EXPENSE_ATTACHMENTS_PER_EXPENSE,
} from "./caps";

export function resolveExpenseAttachmentsDir(): string {
  const raw = process.env.EXPENSE_ATTACHMENTS_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(path.join(process.cwd(), "data", "expense-attachments"));
}

function requireHomeExpenseAttachmentsAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function assertExpenseBelongsToHome(
  db: AppDb,
  homeId: string,
  expenseId: string,
): void {
  const row = db
    .select({ id: homeExpenses.id })
    .from(homeExpenses)
    .where(and(eq(homeExpenses.id, expenseId), eq(homeExpenses.homeId, homeId)))
    .get();
  if (!row) {
    throw new NotFoundError();
  }
}

export type HomeExpenseAttachmentDto = {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  createdAtUtcMs: number;
};

export function listHomeExpenseAttachments(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  expenseId: string,
): HomeExpenseAttachmentDto[] {
  requireHomeExpenseAttachmentsAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
  assertExpenseBelongsToHome(db, homeId, expenseId);

  const rows = db
    .select()
    .from(homeExpenseAttachments)
    .where(eq(homeExpenseAttachments.homeExpenseId, expenseId))
    .all();

  return rows.map((r) => ({
    id: r.id,
    originalFilename: r.originalFilename,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    createdAtUtcMs: r.createdAtUtcMs,
  }));
}

export function uploadHomeExpenseAttachment(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  expenseId: string,
  input: {
    bytes: Uint8Array;
    declaredContentType: string;
    originalFilename: string;
  },
  nowUtcMs: number,
  baseDir: string = resolveExpenseAttachmentsDir(),
): HomeExpenseAttachmentDto {
  requireHomeExpenseAttachmentsAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
  assertExpenseBelongsToHome(db, homeId, expenseId);

  if (input.bytes.byteLength > MAX_HOME_EXPENSE_ATTACHMENT_FILE_BYTES) {
    throw new ValidationError(
      `Each attachment must be at most ${MAX_HOME_EXPENSE_ATTACHMENT_FILE_BYTES} bytes.`,
    );
  }

  const cntRow = db
    .select({ n: count() })
    .from(homeExpenseAttachments)
    .where(eq(homeExpenseAttachments.homeExpenseId, expenseId))
    .get();
  const existing = Number(cntRow?.n ?? 0);
  if (existing >= MAX_HOME_EXPENSE_ATTACHMENTS_PER_EXPENSE) {
    throw new ValidationError(
      `At most ${MAX_HOME_EXPENSE_ATTACHMENTS_PER_EXPENSE} attachments per expense.`,
    );
  }

  const { contentType, kind } = validateExpenseAttachmentContent(
    input.bytes,
    input.declaredContentType,
  );

  const safeName = sanitizeOriginalFilename(input.originalFilename);
  const id = randomUUID();
  const ext = fileExtensionForExpenseAttachmentKind(kind);
  const relative = `${homeId}/${expenseId}/${id}.${ext}`;
  const absolute = path.join(baseDir, homeId, expenseId, `${id}.${ext}`);

  fs.mkdirSync(path.dirname(absolute), { recursive: true });

  let wrote = false;
  try {
    fs.writeFileSync(absolute, input.bytes);
    wrote = true;
    db.insert(homeExpenseAttachments)
      .values({
        id,
        homeExpenseId: expenseId,
        originalFilename: safeName,
        storedRelativePath: relative,
        contentType,
        sizeBytes: input.bytes.byteLength,
        createdAtUtcMs: nowUtcMs,
        createdByUserId: actor.userId,
      })
      .run();
  } catch (e) {
    if (wrote) {
      try {
        fs.unlinkSync(absolute);
      } catch {
        /* ignore */
      }
    }
    throw e;
  }

  const row = db
    .select()
    .from(homeExpenseAttachments)
    .where(eq(homeExpenseAttachments.id, id))
    .get();
  if (!row) {
    throw new Error("attachment insert failed");
  }
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAtUtcMs: row.createdAtUtcMs,
  };
}

function sanitizeOriginalFilename(name: string): string {
  const base =
    name.replace(/\\/g, "/").split("/").pop()?.trim() ?? "attachment";
  const sliced = base.slice(0, 200);
  return sliced.length > 0 ? sliced : "attachment";
}

export function isPathUnderDirectory(filePath: string, baseDir: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedFile = path.resolve(filePath);
  const prefix =
    resolvedBase.endsWith(path.sep) ? resolvedBase : `${resolvedBase}${path.sep}`;
  return resolvedFile === resolvedBase || resolvedFile.startsWith(prefix);
}

/** Removes stored bytes for every attachment on an expense (call before deleting the expense row). */
export function unlinkHomeExpenseAttachmentFilesForExpense(
  db: AppDb,
  expenseId: string,
  baseDir: string,
): void {
  const rows = db
    .select({ p: homeExpenseAttachments.storedRelativePath })
    .from(homeExpenseAttachments)
    .where(eq(homeExpenseAttachments.homeExpenseId, expenseId))
    .all();
  for (const r of rows) {
    const abs = path.join(baseDir, r.p);
    if (!isPathUnderDirectory(abs, baseDir)) {
      continue;
    }
    try {
      fs.unlinkSync(abs);
    } catch {
      /* ignore missing */
    }
  }
}

export function readHomeExpenseAttachmentBytes(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  expenseId: string,
  attachmentId: string,
  baseDir: string = resolveExpenseAttachmentsDir(),
): { buffer: Buffer; filename: string; contentType: string } {
  requireHomeExpenseAttachmentsAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
  assertExpenseBelongsToHome(db, homeId, expenseId);

  const row = db
    .select()
    .from(homeExpenseAttachments)
    .where(
      and(
        eq(homeExpenseAttachments.id, attachmentId),
        eq(homeExpenseAttachments.homeExpenseId, expenseId),
      ),
    )
    .get();
  if (!row) {
    throw new NotFoundError();
  }

  const abs = path.join(baseDir, row.storedRelativePath);
  if (!isPathUnderDirectory(abs, baseDir)) {
    throw new NotFoundError();
  }
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(abs);
  } catch {
    throw new NotFoundError();
  }
  return {
    buffer,
    filename: row.originalFilename,
    contentType: row.contentType,
  };
}

export function deleteHomeExpenseAttachment(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  expenseId: string,
  attachmentId: string,
  baseDir: string = resolveExpenseAttachmentsDir(),
): void {
  requireHomeExpenseAttachmentsAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
  assertExpenseBelongsToHome(db, homeId, expenseId);

  const row = db
    .select()
    .from(homeExpenseAttachments)
    .where(
      and(
        eq(homeExpenseAttachments.id, attachmentId),
        eq(homeExpenseAttachments.homeExpenseId, expenseId),
      ),
    )
    .get();
  if (!row) {
    throw new NotFoundError();
  }

  const abs = path.join(baseDir, row.storedRelativePath);
  if (isPathUnderDirectory(abs, baseDir)) {
    try {
      fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
  db.delete(homeExpenseAttachments)
    .where(eq(homeExpenseAttachments.id, attachmentId))
    .run();
}
