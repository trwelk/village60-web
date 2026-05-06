import { eq } from "drizzle-orm";
import { appSettings } from "@/db/schema";
import type { SessionActor } from "@/lib/authz/sessionActor";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, ValidationError } from "@/lib/homes/errors";

export const MEDICATION_ORDER_COVERAGE_MONTHS_KEY =
  "medication_order_coverage_months" as const;

export const MEDICATION_ORDER_COVERAGE_MONTHS_DEFAULT = 3;
export const MEDICATION_ORDER_COVERAGE_MONTHS_MIN = 1;
export const MEDICATION_ORDER_COVERAGE_MONTHS_MAX = 36;

function requireMedicationOrderSettingsAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

/**
 * Read global months multiplier for medication order quantity formula.
 * No auth — use only from trusted server code (e.g. order builder in **34b**).
 */
export function readMedicationOrderCoverageMonths(db: AppDb): number {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, MEDICATION_ORDER_COVERAGE_MONTHS_KEY))
    .get();
  if (!row) {
    return MEDICATION_ORDER_COVERAGE_MONTHS_DEFAULT;
  }
  return row.valueInt;
}

export function getMedicationOrderCoverageMonthsForAdmin(
  db: AppDb,
  actor: SessionActor | undefined,
): number {
  requireMedicationOrderSettingsAdmin(actor);
  return readMedicationOrderCoverageMonths(db);
}

export function setMedicationOrderCoverageMonthsForAdmin(
  db: AppDb,
  actor: SessionActor | undefined,
  raw: unknown,
  nowUtcMs: number,
): number {
  requireMedicationOrderSettingsAdmin(actor);
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;
  if (
    !Number.isInteger(n) ||
    n < MEDICATION_ORDER_COVERAGE_MONTHS_MIN ||
    n > MEDICATION_ORDER_COVERAGE_MONTHS_MAX
  ) {
    throw new ValidationError(
      `medicationOrderCoverageMonths must be an integer between ${MEDICATION_ORDER_COVERAGE_MONTHS_MIN} and ${MEDICATION_ORDER_COVERAGE_MONTHS_MAX}.`,
    );
  }
  const existing = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, MEDICATION_ORDER_COVERAGE_MONTHS_KEY))
    .get();
  if (existing) {
    db.update(appSettings)
      .set({ valueInt: n, updatedAtUtcMs: nowUtcMs })
      .where(eq(appSettings.key, MEDICATION_ORDER_COVERAGE_MONTHS_KEY))
      .run();
  } else {
    db.insert(appSettings)
      .values({
        key: MEDICATION_ORDER_COVERAGE_MONTHS_KEY,
        valueInt: n,
        updatedAtUtcMs: nowUtcMs,
      })
      .run();
  }
  return n;
}
