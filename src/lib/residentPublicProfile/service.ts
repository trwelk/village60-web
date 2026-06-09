import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { homes, residents, wards } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { NotFoundError } from "@/lib/homes/errors";
import { resolveResidentPortraitsDir } from "@/lib/residentPortraits/service";

export type ResidentPublicProfile = {
  fullName: string;
  dob: string;
  admissionDate: string;
  status: "active" | "departed";
  roomText: string | null;
  wardLabel: string | null;
  homeName: string;
  hasPortrait: boolean;
  portraitUpdatedAtUtcMs: number | null;
};

function assertResidentByPublicToken(
  db: AppDb,
  publicToken: string,
): typeof residents.$inferSelect {
  const row = db
    .select()
    .from(residents)
    .where(eq(residents.publicToken, publicToken))
    .get();
  if (!row) {
    throw new NotFoundError();
  }
  return row;
}

export function getResidentPublicProfile(
  db: AppDb,
  publicToken: string,
): ResidentPublicProfile {
  const resident = assertResidentByPublicToken(db, publicToken);
  const home = db
    .select()
    .from(homes)
    .where(eq(homes.id, resident.homeId))
    .get();
  if (!home) {
    throw new NotFoundError();
  }

  let wardLabel: string | null = null;
  if (resident.wardId) {
    const ward = db
      .select()
      .from(wards)
      .where(eq(wards.id, resident.wardId))
      .get();
    wardLabel = ward?.label ?? null;
  }

  return {
    fullName: resident.fullName,
    dob: resident.dob,
    admissionDate: resident.admissionDate,
    status: resident.status as "active" | "departed",
    roomText: resident.roomText,
    wardLabel,
    homeName: home.name,
    hasPortrait: Boolean(resident.portraitStoredRelativePath?.trim()),
    portraitUpdatedAtUtcMs: resident.portraitUpdatedAtUtcMs,
  };
}

export function readPublicResidentPortraitBytes(
  db: AppDb,
  publicToken: string,
  baseDir: string = resolveResidentPortraitsDir(),
): { buffer: Buffer; contentType: string } {
  const row = assertResidentByPublicToken(db, publicToken);
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
