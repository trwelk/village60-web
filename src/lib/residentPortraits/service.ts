import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { residents } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import { fileExtensionForExpenseAttachmentKind } from "@/lib/homeExpenseAttachments/sniff";
import { MAX_RESIDENT_PORTRAIT_FILE_BYTES } from "./caps";
import { validatePortraitImageContent } from "./sniff";

export function resolveResidentPortraitsDir(): string {
  const raw = process.env.RESIDENT_PORTRAITS_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(path.join(process.cwd(), "data", "resident-portraits"));
}

export { MAX_RESIDENT_PORTRAIT_FILE_BYTES } from "./caps";

function assertResidentInHome(
  db: AppDb,
  homeId: string,
  residentId: string,
): typeof residents.$inferSelect {
  const row = db.select().from(residents).where(eq(residents.id, residentId)).get();
  if (!row || row.homeId !== homeId) {
    throw new NotFoundError();
  }
  return row;
}

/**
 * Upload or replace the resident's portrait. Replaces delete the previous file when present.
 */
export function uploadResidentPortrait(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  input: {
    bytes: Uint8Array;
    declaredContentType: string;
    originalFilename: string;
  },
  nowUtcMs: number,
  baseDir: string = resolveResidentPortraitsDir(),
): { portraitUpdatedAtUtcMs: number } {
  if (!actor) {
    throw new ForbiddenError();
  }
  assertActorMayAccessHome(db, actor, homeId);
  const existing = assertResidentInHome(db, homeId, residentId);
  if (existing.status === "departed") {
    throw new ForbiddenError("Portrait cannot be changed for a departed resident.");
  }

  if (input.bytes.byteLength > MAX_RESIDENT_PORTRAIT_FILE_BYTES) {
    throw new ValidationError(
      `Portrait must be at most ${MAX_RESIDENT_PORTRAIT_FILE_BYTES} bytes.`,
    );
  }

  const { kind, contentType } = validatePortraitImageContent(
    input.bytes,
    input.declaredContentType,
  );

  const id = randomUUID();
  const ext = fileExtensionForExpenseAttachmentKind(kind);
  const relative = `${homeId}/${residentId}/${id}.${ext}`;
  const absolute = path.join(baseDir, homeId, residentId, `${id}.${ext}`);

  const previousRelative = existing.portraitStoredRelativePath?.trim() ?? "";
  const previousAbsolute =
    previousRelative.length > 0
      ? path.join(baseDir, ...previousRelative.split("/"))
      : null;

  fs.mkdirSync(path.dirname(absolute), { recursive: true });

  let wrote = false;
  try {
    fs.writeFileSync(absolute, input.bytes);
    wrote = true;
    db.update(residents)
      .set({
        portraitStoredRelativePath: relative,
        portraitContentType: contentType,
        portraitSizeBytes: input.bytes.byteLength,
        portraitUpdatedAtUtcMs: nowUtcMs,
        updatedAtUtcMs: nowUtcMs,
      })
      .where(eq(residents.id, residentId))
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

  if (previousAbsolute && fs.existsSync(previousAbsolute)) {
    try {
      fs.unlinkSync(previousAbsolute);
    } catch {
      /* ignore */
    }
  }

  return { portraitUpdatedAtUtcMs: nowUtcMs };
}

export function readResidentPortraitBytes(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  baseDir: string = resolveResidentPortraitsDir(),
): { buffer: Buffer; contentType: string } {
  if (!actor) {
    throw new ForbiddenError();
  }
  assertActorMayAccessHome(db, actor, homeId);
  const row = assertResidentInHome(db, homeId, residentId);
  const rel = row.portraitStoredRelativePath?.trim() ?? "";
  if (!rel || !row.portraitContentType) {
    throw new NotFoundError("No portrait on file.");
  }
  const absolute = path.join(baseDir, ...rel.split("/"));
  if (!fs.existsSync(absolute)) {
    throw new NotFoundError("Portrait file missing.");
  }
  return {
    buffer: fs.readFileSync(absolute),
    contentType: row.portraitContentType,
  };
}

/** Clears portrait metadata and deletes the stored file when present. Idempotent. */
export function deleteResidentPortrait(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  nowUtcMs: number,
  baseDir: string = resolveResidentPortraitsDir(),
): void {
  if (!actor) {
    throw new ForbiddenError();
  }
  assertActorMayAccessHome(db, actor, homeId);
  const row = assertResidentInHome(db, homeId, residentId);
  if (row.status === "departed") {
    throw new ForbiddenError("Portrait cannot be changed for a departed resident.");
  }

  const rel = row.portraitStoredRelativePath?.trim() ?? "";
  if (rel.length > 0) {
    const absolute = path.join(baseDir, ...rel.split("/"));
    if (fs.existsSync(absolute)) {
      try {
        fs.unlinkSync(absolute);
      } catch {
        /* ignore */
      }
    }
  }

  db.update(residents)
    .set({
      portraitStoredRelativePath: null,
      portraitContentType: null,
      portraitSizeBytes: null,
      portraitUpdatedAtUtcMs: null,
      updatedAtUtcMs: nowUtcMs,
    })
    .where(eq(residents.id, residentId))
    .run();
}
