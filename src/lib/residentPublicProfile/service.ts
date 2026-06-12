import fs from "node:fs";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import {
  homes,
  inventoryItems,
  residentAllergies,
  residentConditions,
  residentMedications,
  residents,
  wards,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { NotFoundError } from "@/lib/homes/errors";
import {
  MAR_SLOT_LABELS,
  resolveMedicationSlots,
} from "@/lib/mar/constants";
import { resolveResidentPortraitsDir } from "@/lib/residentPortraits/service";

export type PublicProfileAllergy = {
  allergen: string;
  notes: string | null;
};

export type PublicProfileCondition = {
  label: string;
};

export type PublicProfileMedication = {
  name: string;
  quantityPerServing: number;
  unit: string;
  directions: string;
  prn: boolean;
  scheduleLabel: string;
};

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
  allergies: PublicProfileAllergy[];
  conditions: PublicProfileCondition[];
  medications: PublicProfileMedication[];
};

function formatMedicationScheduleLabel(input: {
  prn: boolean;
  scheduledSlots: string | null;
  servingsPerDay: number | null;
}): string {
  if (input.prn) {
    return "As needed (PRN)";
  }
  const slots = resolveMedicationSlots(input);
  if (slots.length === 0) {
    return "Scheduled";
  }
  return slots.map((slot) => MAR_SLOT_LABELS[slot]).join(" · ");
}

function listPublicClinicalForResident(
  db: AppDb,
  residentId: string,
): Pick<
  ResidentPublicProfile,
  "allergies" | "conditions" | "medications"
> {
  const allergies = db
    .select({
      allergen: residentAllergies.allergen,
      notes: residentAllergies.notes,
    })
    .from(residentAllergies)
    .where(eq(residentAllergies.residentId, residentId))
    .orderBy(asc(residentAllergies.sortOrder), asc(residentAllergies.id))
    .all();

  const conditions = db
    .select({ label: residentConditions.label })
    .from(residentConditions)
    .where(eq(residentConditions.residentId, residentId))
    .orderBy(asc(residentConditions.sortOrder), asc(residentConditions.id))
    .all();

  const medicationRows = db
    .select({
      name: inventoryItems.name,
      unit: inventoryItems.baseUnit,
      quantityPerServing: residentMedications.quantityPerServing,
      directions: residentMedications.directions,
      prn: residentMedications.prn,
      scheduledSlots: residentMedications.scheduledSlots,
      servingsPerDay: residentMedications.servingsPerDay,
    })
    .from(residentMedications)
    .innerJoin(inventoryItems, eq(residentMedications.itemId, inventoryItems.id))
    .where(
      and(
        eq(residentMedications.residentId, residentId),
        eq(residentMedications.status, "active"),
      ),
    )
    .orderBy(asc(residentMedications.sortOrder), asc(residentMedications.id))
    .all();

  const medications = medicationRows.map((row) => ({
    name: row.name,
    quantityPerServing: row.quantityPerServing,
    unit: row.unit,
    directions: row.directions,
    prn: row.prn,
    scheduleLabel: formatMedicationScheduleLabel(row),
  }));

  return { allergies, conditions, medications };
}

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

  const clinical = listPublicClinicalForResident(db, resident.id);

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
    ...clinical,
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
