import { and, asc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { medicationOrderLines, medicationOrders, medications, residentMedications, residents } from "@/db/schema";
import { ForbiddenError } from "@/lib/homes/errors";
import type { AppDb } from "@/lib/homes/service";
import { readMedicationOrderCoverageMonths } from "@/lib/medicationOrderSettings/service";
import { computeMedicationOrderLineQty } from "./formula";

export type HomeLowStockLine = {
  residentMedicationId: string;
  medicationId: string;
  name: string;
  strength: string;
  unit: string;
  currentStock: number;
  minimumInStock: number;
  deficit: number;
  suggestedOrderQty: number;
  hasOpenOrder: boolean;
};

export type HomeLowStockResidentGroup = {
  residentId: string;
  residentFullName: string;
  lines: HomeLowStockLine[];
};

function requireActor(actor: SessionActor | undefined): asserts actor is SessionActor {
  if (!actor) {
    throw new ForbiddenError();
  }
}

/**
 * Active resident meds with `minimum_in_stock` set where `current_stock < minimum_in_stock`,
 * grouped by resident. Lines include suggested reorder qty via {@link computeMedicationOrderLineQty}.
 */
export function listHomeLowStockMedicationGroups(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): { medicationOrderCoverageMonths: number; groups: HomeLowStockResidentGroup[] } {
  requireActor(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const coverageMonths = readMedicationOrderCoverageMonths(db);

  const rows = db
    .select({
      rm: residentMedications,
      m: medications,
      r: residents,
    })
    .from(residentMedications)
    .innerJoin(medications, eq(residentMedications.medicationId, medications.id))
    .innerJoin(residents, eq(residentMedications.residentId, residents.id))
    .where(
      and(
        eq(residents.homeId, homeId),
        eq(residentMedications.status, "active"),
        isNotNull(residentMedications.minimumInStock),
        lt(residentMedications.currentStock, residentMedications.minimumInStock),
      ),
    )
    .orderBy(asc(residents.fullName), asc(medications.name), asc(medications.id))
    .all();

  if (rows.length === 0) {
    return { medicationOrderCoverageMonths: coverageMonths, groups: [] };
  }

  // Fetch open orders for these residents to compute in-flight remainder and hasOpenOrder
  const residentIds = Array.from(new Set(rows.map((r) => r.r.id)));
  
  const openOrders = db
    .select({
      id: medicationOrders.id,
      residentId: medicationOrders.residentId,
      status: medicationOrders.status,
    })
    .from(medicationOrders)
    .where(
      and(
        inArray(medicationOrders.residentId, residentIds),
        inArray(medicationOrders.status, ["pending", "approved", "order_placed"]),
      ),
    )
    .all();

  const openOrderIds = openOrders.map((o) => o.id);
  let openLines: typeof medicationOrderLines.$inferSelect[] = [];
  if (openOrderIds.length > 0) {
    openLines = db
      .select()
      .from(medicationOrderLines)
      .where(inArray(medicationOrderLines.orderId, openOrderIds))
      .all();
  }

  const inFlightRemainderByMed = new Map<string, number>();
  const hasOpenOrderByMed = new Set<string>();

  const orderStatusById = new Map(openOrders.map((o) => [o.id, o.status]));

  for (const line of openLines) {
    hasOpenOrderByMed.add(line.residentMedicationId);
    const status = orderStatusById.get(line.orderId);
    if (status === "order_placed" && line.closedShortAtUtcMs == null) {
      const remainder = Math.max(0, line.orderedQty - line.receivedQty);
      const current = inFlightRemainderByMed.get(line.residentMedicationId) ?? 0;
      inFlightRemainderByMed.set(line.residentMedicationId, current + remainder);
    }
  }

  const byResident = new Map<string, { fullName: string; lines: HomeLowStockLine[] }>();

  for (const { rm, m, r } of rows) {
    const min = rm.minimumInStock!;
    const inFlight = inFlightRemainderByMed.get(rm.id) ?? 0;
    const projectedStock = rm.currentStock + inFlight;
    
    // Deficit is min - projectedStock
    const deficit = Math.max(0, min - projectedStock);
    
    const suggestedOrderQty = computeMedicationOrderLineQty({
      minimumInStock: min,
      medicationOrderCoverageMonths: coverageMonths,
      currentStock: projectedStock,
    });
    
    const line: HomeLowStockLine = {
      residentMedicationId: rm.id,
      medicationId: m.id,
      name: m.name,
      strength: m.strength,
      unit: m.unit,
      currentStock: rm.currentStock,
      minimumInStock: min,
      deficit,
      suggestedOrderQty,
      hasOpenOrder: hasOpenOrderByMed.has(rm.id),
    };
    const existing = byResident.get(r.id);
    if (existing) {
      existing.lines.push(line);
    } else {
      byResident.set(r.id, { fullName: r.fullName, lines: [line] });
    }
  }

  const groups: HomeLowStockResidentGroup[] = [];
  for (const [residentId, { fullName, lines }] of byResident) {
    lines.sort((a, b) => b.deficit - a.deficit);
    groups.push({
      residentId,
      residentFullName: fullName,
      lines,
    });
  }

  groups.sort((a, b) => {
    const ma = Math.max(...a.lines.map((l) => l.deficit));
    const mb = Math.max(...b.lines.map((l) => l.deficit));
    return mb - ma;
  });

  return { medicationOrderCoverageMonths: coverageMonths, groups };
}
