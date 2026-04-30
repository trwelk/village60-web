import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  residentMonthlyCharges,
  residents,
  wards,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { parseBillingMonth } from "./billingMonth";

export type MonthlyChargeSkipReason = "no_ward" | "no_rate" | "duplicate";

export type MonthlyChargeSkip = {
  residentId: string;
  homeId: string;
  reason: MonthlyChargeSkipReason;
};

export type GenerateMonthlyChargesResult = {
  billingMonth: string;
  created: number;
  skipped: MonthlyChargeSkip[];
};

/**
 * Idempotent monthly charge generation for one UTC `billing_month` (YYYY-MM).
 * See issue 16b: active residents with ward + ward rate; others skipped; unique (resident, month).
 */
export function generateMonthlyCharges(
  db: AppDb,
  input: { billingMonth: string },
): GenerateMonthlyChargesResult {
  const billingMonth = parseBillingMonth(input.billingMonth);
  const now = Date.now();

  const active = db
    .select()
    .from(residents)
    .where(eq(residents.status, "active"))
    .all();

  const wardRows = db.select().from(wards).all();
  const wardById = new Map(wardRows.map((w) => [w.id, w]));

  const skipped: MonthlyChargeSkip[] = [];
  let created = 0;

  for (const r of active) {
    if (r.wardId == null) {
      skipped.push({
        residentId: r.id,
        homeId: r.homeId,
        reason: "no_ward",
      });
      continue;
    }

    const ward = wardById.get(r.wardId);
    if (!ward) {
      skipped.push({
        residentId: r.id,
        homeId: r.homeId,
        reason: "no_ward",
      });
      continue;
    }

    if (ward.monthlyRatePerPersonMinor == null) {
      skipped.push({
        residentId: r.id,
        homeId: r.homeId,
        reason: "no_rate",
      });
      continue;
    }

    const row = {
      id: randomUUID(),
      residentId: r.id,
      billingMonth,
      wardIdSnapshot: r.wardId,
      amountMinorSnapshot: ward.monthlyRatePerPersonMinor,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    };

    const runResult = db
      .insert(residentMonthlyCharges)
      .values(row)
      .onConflictDoNothing({
        target: [
          residentMonthlyCharges.residentId,
          residentMonthlyCharges.billingMonth,
        ],
      })
      .run();

    if (runResult.changes > 0) {
      created += 1;
    } else {
      skipped.push({
        residentId: r.id,
        homeId: r.homeId,
        reason: "duplicate",
      });
    }
  }

  return { billingMonth, created, skipped };
}
