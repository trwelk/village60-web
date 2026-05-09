import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { homeInvNumberSeq, invoices } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";

/** Highest numeric `inv_no` suffix for the home (`INV-` + digits), or 0 if none / unparsable. */
function maxExistingInvNumericSuffix(db: AppDb, homeId: string): number {
  const row = db
    .select({ invNo: invoices.invNo })
    .from(invoices)
    .where(
      and(eq(invoices.homeId, homeId), isNotNull(invoices.invNo), sql`${invoices.invNo} GLOB 'INV-[0-9]*'`),
    )
    .orderBy(desc(sql`CAST(SUBSTR(${invoices.invNo}, 5) AS INTEGER)`))
    .limit(1)
    .get();
  if (!row?.invNo) return 0;
  const match = /^INV-(\d+)$/.exec(row.invNo);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/**
 * Next monotonic per-home invoice number (`INV-00001`). Call inside the same `db.transaction`
 * as the `invoices` insert so the counter rolls back if the insert fails.
 */
export function bumpInvNumberSequence(db: AppDb, homeId: string, nowUtcMs: number): string {
  const hasRow = db
    .select({ homeId: homeInvNumberSeq.homeId })
    .from(homeInvNumberSeq)
    .where(eq(homeInvNumberSeq.homeId, homeId))
    .get();
  if (!hasRow) {
    const lastUsed = maxExistingInvNumericSuffix(db, homeId);
    db.insert(homeInvNumberSeq)
      .values({ homeId, lastSuffix: lastUsed, updatedAtUtcMs: nowUtcMs })
      .onConflictDoNothing()
      .run();
  }
  const bumped = db
    .update(homeInvNumberSeq)
    .set({ lastSuffix: sql`${homeInvNumberSeq.lastSuffix} + 1`, updatedAtUtcMs: nowUtcMs })
    .where(eq(homeInvNumberSeq.homeId, homeId))
    .returning({ lastSuffix: homeInvNumberSeq.lastSuffix })
    .get();
  if (!bumped) {
    throw new Error("Invoice number sequence update failed.");
  }
  return `INV-${String(bumped.lastSuffix).padStart(5, "0")}`;
}
