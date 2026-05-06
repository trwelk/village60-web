import { randomUUID } from "node:crypto";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import {
  residentMedications,
  residentMedicationStockEvents,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";

export type NightlyMedicationAutoDeductionResult = {
  processed: number;
};

/**
 * Nightly job: one `auto_deduction` ledger row and matching stock decrement per
 * active, non-PRN regimen line with a daily schedule (`servings_per_day` set).
 */
export function runNightlyMedicationAutoDeductions(
  db: AppDb,
): NightlyMedicationAutoDeductionResult {
  const rows = db
    .select()
    .from(residentMedications)
    .where(
      and(
        eq(residentMedications.status, "active"),
        eq(residentMedications.prn, false),
        isNotNull(residentMedications.servingsPerDay),
        gte(residentMedications.servingsPerDay, 1),
      ),
    )
    .all();

  const now = Date.now();
  db.transaction((tx) => {
    for (const row of rows) {
      const servings = row.servingsPerDay!;
      const dailyUse = row.quantityPerServing * servings;
      const ledgerAmount = -dailyUse;
      const newStock = row.currentStock - dailyUse;
      tx.insert(residentMedicationStockEvents)
        .values({
          id: randomUUID(),
          residentMedicationId: row.id,
          eventType: "auto_deduction",
          amount: ledgerAmount,
          createdAtUtcMs: now,
          createdByUserId: null,
        })
        .run();
      tx.update(residentMedications)
        .set({ currentStock: newStock, updatedAtUtcMs: now })
        .where(eq(residentMedications.id, row.id))
        .run();
    }
  });

  return { processed: rows.length };
}
