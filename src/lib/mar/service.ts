import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import {
  inventoryItems,
  inventoryTransactions,
  medicationAdministrations,
  residentMedications,
  residents,
  users,
} from "@/db/schema";
import { recordInventoryTransaction } from "@/lib/inventory/service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import type { AppDb } from "@/lib/homes/service";
import {
  isMarSlot,
  isMarTimeSlot,
  MAR_SLOT_LABELS,
  MAR_TIME_SLOTS,
  resolveMedicationSlots,
  type MarTimeSlot,
} from "./constants";

export type MarAdministrationRecord = {
  id: string;
  administeredAtUtcMs: number;
  administeredByUserId: string;
  administeredByDisplayName: string | null;
  notes: string | null;
};

export type MarMedicationEntry = {
  residentMedicationId: string;
  residentId: string;
  residentName: string;
  hasPortrait: boolean;
  itemName: string;
  unit: string;
  quantityPerServing: number;
  directions: string;
  administration: MarAdministrationRecord | null;
};

export type MarSlotGroup = {
  slot: MarTimeSlot;
  label: string;
  medications: MarMedicationEntry[];
  totalCount: number;
  administeredCount: number;
};

export type MarPrnMedication = {
  residentMedicationId: string;
  residentId: string;
  residentName: string;
  hasPortrait: boolean;
  itemName: string;
  unit: string;
  quantityPerServing: number;
  directions: string;
  administrationsToday: MarAdministrationRecord[];
};

export type MarDayView = {
  date: string;
  slots: MarSlotGroup[];
  prnMedications: MarPrnMedication[];
};

export type RecordAdministrationInput = {
  residentMedicationId: string;
  slot: string;
  date: string;
  notes?: string | null;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(date: string): void {
  if (!ISO_DATE_RE.test(date)) {
    throw new ValidationError("date must be YYYY-MM-DD.");
  }
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeOptionalNotes(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new ValidationError("notes must be a string or null.");
  }
  const trimmed = raw.trim();
  return trimmed || null;
}

function mapAdministrationRow(
  row: typeof medicationAdministrations.$inferSelect,
  userDisplayName: string | null,
): MarAdministrationRecord {
  return {
    id: row.id,
    administeredAtUtcMs: row.administeredAtUtcMs,
    administeredByUserId: row.administeredByUserId,
    administeredByDisplayName: userDisplayName,
    notes: row.notes,
  };
}

function getMedicationForHome(
  db: AppDb,
  homeId: string,
  residentMedicationId: string,
) {
  const row = db
    .select({
      rm: residentMedications,
      resident: residents,
      item: inventoryItems,
    })
    .from(residentMedications)
    .innerJoin(residents, eq(residentMedications.residentId, residents.id))
    .innerJoin(inventoryItems, eq(residentMedications.itemId, inventoryItems.id))
    .where(
      and(
        eq(residentMedications.id, residentMedicationId),
        eq(residents.homeId, homeId),
      ),
    )
    .get();
  return row ?? null;
}

function isSqliteUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export function getMARForHome(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  date: string,
): MarDayView {
  assertActorMayAccessHome(db, actor, homeId);
  assertIsoDate(date);

  const activeResidents = db
    .select()
    .from(residents)
    .where(and(eq(residents.homeId, homeId), eq(residents.status, "active")))
    .orderBy(asc(residents.normalizedFullName), asc(residents.id))
    .all();

  const activeResidentIds = new Set(activeResidents.map((r) => r.id));
  const residentById = new Map(activeResidents.map((r) => [r.id, r]));

  const medicationRows =
    activeResidentIds.size === 0
      ? []
      : db
          .select({
            rm: residentMedications,
            item: inventoryItems,
          })
          .from(residentMedications)
          .innerJoin(
            inventoryItems,
            eq(residentMedications.itemId, inventoryItems.id),
          )
          .where(eq(residentMedications.status, "active"))
          .orderBy(
            asc(residentMedications.sortOrder),
            asc(residentMedications.id),
          )
          .all()
          .filter(({ rm }) => activeResidentIds.has(rm.residentId));

  const administrationRows = db
    .select({
      admin: medicationAdministrations,
      user: users,
    })
    .from(medicationAdministrations)
    .innerJoin(users, eq(medicationAdministrations.administeredByUserId, users.id))
    .where(
      and(
        eq(medicationAdministrations.homeId, homeId),
        eq(medicationAdministrations.date, date),
      ),
    )
    .all();

  const adminByKey = new Map<string, MarAdministrationRecord>();
  const prnAdminsByMedication = new Map<string, MarAdministrationRecord[]>();

  for (const { admin, user } of administrationRows) {
    const mapped = mapAdministrationRow(
      admin,
      user.displayName ?? user.email,
    );
    if (admin.slot === "prn") {
      const list = prnAdminsByMedication.get(admin.residentMedicationId) ?? [];
      list.push(mapped);
      prnAdminsByMedication.set(admin.residentMedicationId, list);
      continue;
    }
    adminByKey.set(`${admin.residentMedicationId}:${admin.slot}`, mapped);
  }

  const slotMedications = new Map<MarTimeSlot, MarMedicationEntry[]>(
    MAR_TIME_SLOTS.map((slot) => [slot, []]),
  );
  const prnMedications: MarPrnMedication[] = [];

  for (const { rm, item } of medicationRows) {
    const resident = residentById.get(rm.residentId);
    if (!resident) continue;

    if (rm.prn) {
      prnMedications.push({
        residentMedicationId: rm.id,
        residentId: rm.residentId,
        residentName: resident.fullName,
        hasPortrait: resident.portraitStoredRelativePath != null,
        itemName: item.name,
        unit: item.baseUnit,
        quantityPerServing: rm.quantityPerServing,
        directions: rm.directions,
        administrationsToday:
          prnAdminsByMedication.get(rm.id)?.sort(
            (a, b) => a.administeredAtUtcMs - b.administeredAtUtcMs,
          ) ?? [],
      });
      continue;
    }

    const slots = resolveMedicationSlots({
      scheduledSlots: rm.scheduledSlots,
      servingsPerDay: rm.servingsPerDay,
      prn: rm.prn,
    });

    for (const slot of slots) {
      const list = slotMedications.get(slot)!;
      list.push({
        residentMedicationId: rm.id,
        residentId: rm.residentId,
        residentName: resident.fullName,
        hasPortrait: resident.portraitStoredRelativePath != null,
        itemName: item.name,
        unit: item.baseUnit,
        quantityPerServing: rm.quantityPerServing,
        directions: rm.directions,
        administration: adminByKey.get(`${rm.id}:${slot}`) ?? null,
      });
    }
  }

  const slots: MarSlotGroup[] = MAR_TIME_SLOTS.map((slot) => {
    const medications = slotMedications.get(slot) ?? [];
    return {
      slot,
      label: MAR_SLOT_LABELS[slot],
      medications,
      totalCount: medications.length,
      administeredCount: medications.filter((m) => m.administration).length,
    };
  });

  prnMedications.sort((a, b) =>
    a.residentName.localeCompare(b.residentName, undefined, {
      sensitivity: "base",
    }),
  );

  return { date, slots, prnMedications };
}

function insertAdministration(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  input: RecordAdministrationInput,
): MarAdministrationRecord {
  assertIsoDate(input.date);
  if (!isMarSlot(input.slot)) {
    throw new ValidationError("slot is invalid.");
  }

  const medication = getMedicationForHome(db, homeId, input.residentMedicationId);
  if (!medication) {
    throw new NotFoundError();
  }
  if (medication.rm.status !== "active") {
    throw new ValidationError("Medication is not active.");
  }
  if (medication.resident.status !== "active") {
    throw new ValidationError("Resident is not active.");
  }

  const notes = normalizeOptionalNotes(input.notes);
  const now = Date.now();
  const id = randomUUID();

  if (input.slot === "prn") {
    if (!medication.rm.prn) {
      throw new ValidationError("This medication is not marked PRN.");
    }
  } else {
    if (medication.rm.prn) {
      throw new ValidationError("PRN medications must use the prn slot.");
    }
    const allowedSlots = resolveMedicationSlots({
      scheduledSlots: medication.rm.scheduledSlots,
      servingsPerDay: medication.rm.servingsPerDay,
      prn: medication.rm.prn,
    });
    if (!allowedSlots.includes(input.slot)) {
      throw new ValidationError("Medication is not scheduled for this time slot.");
    }
    const existing = db
      .select()
      .from(medicationAdministrations)
      .where(
        and(
          eq(medicationAdministrations.residentMedicationId, input.residentMedicationId),
          eq(medicationAdministrations.slot, input.slot),
          eq(medicationAdministrations.date, input.date),
        ),
      )
      .get();
    if (existing) {
      throw new ValidationError("This dose has already been recorded.");
    }
  }

  const actorUser = db
    .select()
    .from(users)
    .where(eq(users.id, actor.userId))
    .get();
  if (!actorUser) {
    throw new ForbiddenError();
  }

  try {
    db.transaction((trx) => {
      try {
        trx.insert(medicationAdministrations)
          .values({
            id,
            homeId,
            residentId: medication.resident.id,
            residentMedicationId: input.residentMedicationId,
            slot: input.slot,
            date: input.date,
            administeredByUserId: actor.userId,
            notes,
            administeredAtUtcMs: now,
            createdAtUtcMs: now,
          })
          .run();
      } catch (e) {
        if (isSqliteUniqueViolation(e)) {
          throw new ValidationError("This dose has already been recorded.");
        }
        throw e;
      }

      recordInventoryTransaction(
        trx as unknown as AppDb,
        actor,
        {
          ownerType: "RESIDENT",
          ownerId: medication.resident.id,
          itemId: medication.rm.itemId,
          transactionType: "MAR_DISPENSE",
          quantityDeltaBaseUnits: -medication.rm.quantityPerServing,
          sourceType: "MAR_ADMINISTRATION",
          sourceId: id,
        },
        now,
      );
    });
  } catch (e) {
    if (e instanceof ValidationError) {
      throw e;
    }
    if (isSqliteUniqueViolation(e)) {
      throw new ValidationError("This dose has already been recorded.");
    }
    throw e;
  }

  return mapAdministrationRow(
    {
      id,
      homeId,
      residentId: medication.resident.id,
      residentMedicationId: input.residentMedicationId,
      slot: input.slot,
      date: input.date,
      administeredByUserId: actor.userId,
      notes,
      administeredAtUtcMs: now,
      createdAtUtcMs: now,
    },
    actorUser.displayName ?? actorUser.email,
  );
}

export function recordAdministration(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  input: RecordAdministrationInput,
): MarAdministrationRecord {
  assertActorMayAccessHome(db, actor, homeId);
  if (input.slot === "prn") {
    throw new ValidationError("Use recordPRN for PRN administrations.");
  }
  if (!isMarTimeSlot(input.slot)) {
    throw new ValidationError("slot is invalid.");
  }
  return insertAdministration(db, actor, homeId, input);
}

export function recordPRN(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  input: Omit<RecordAdministrationInput, "slot">,
): MarAdministrationRecord {
  assertActorMayAccessHome(db, actor, homeId);
  return insertAdministration(db, actor, homeId, { ...input, slot: "prn" });
}

export function undoAdministration(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  administrationId: string,
): void {
  assertActorMayAccessHome(db, actor, homeId);
  const existing = db
    .select()
    .from(medicationAdministrations)
    .where(
      and(
        eq(medicationAdministrations.id, administrationId),
        eq(medicationAdministrations.homeId, homeId),
      ),
    )
    .get();
  if (!existing) {
    throw new NotFoundError();
  }

  if (actor.role !== "admin" && existing.date !== todayIsoDate()) {
    throw new ForbiddenError("Only today's administrations can be undone.");
  }

  const now = Date.now();
  db.transaction((trx) => {
    const originalTx = trx
      .select()
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.sourceType, "MAR_ADMINISTRATION"),
          eq(inventoryTransactions.sourceId, administrationId),
        ),
      )
      .get();

    if (originalTx) {
      recordInventoryTransaction(
        trx as unknown as AppDb,
        actor,
        {
          ownerType:
            originalTx.ownerType === "RESIDENT" ? "RESIDENT" : "HOME",
          ownerId: originalTx.ownerId,
          itemId: originalTx.itemId,
          transactionType: "MAR_DISPENSE_REVERSAL",
          quantityDeltaBaseUnits: -originalTx.quantityDeltaBaseUnits,
          sourceType: "MAR_ADMINISTRATION_UNDO",
          sourceId: administrationId,
        },
        now,
      );
    }

    trx.delete(medicationAdministrations)
      .where(eq(medicationAdministrations.id, administrationId))
      .run();
  });
}
