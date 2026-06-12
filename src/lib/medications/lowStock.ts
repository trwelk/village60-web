import { and, asc, eq, inArray, not } from "drizzle-orm";
import {
  homePurchaseOrderLines,
  homePurchaseOrders,
  homes,
  inventoryBalances,
  inventoryItems,
  residentMedications,
  residents,
} from "@/db/schema";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { NotFoundError } from "@/lib/homes/errors";
import type { AppDb } from "@/lib/homes/service";
import { resolveMedicationSlots } from "@/lib/mar/constants";

export type LowStockUrgency = "critical" | "warning";

export type LowStockMedicationItem = {
  residentId: string;
  residentName: string;
  residentMedicationId: string;
  itemId: string;
  itemName: string;
  unit: string;
  unitClass: "countable" | "measurable";
  quantityPerServing: number;
  prn: boolean;
  slotsPerDay: number | null;
  dailyBurn: number | null;
  onHandBaseUnits: number;
  pendingIncomingBaseUnits: number;
  effectiveOnHandBaseUnits: number;
  daysRemaining: number | null;
  servingsRemaining: number | null;
  threshold: number;
  urgency: LowStockUrgency;
  suggestedOrderQuantityBaseUnits: number;
};

const CRITICAL_DAYS_REMAINING = 2;
const CRITICAL_SERVINGS_REMAINING = 2;

const PENDING_PO_LINE_STATUSES = ["OPEN", "PARTIALLY_RECEIVED"] as const;

function residentItemKey(residentId: string, itemId: string): string {
  return `${residentId}:${itemId}`;
}

function loadPendingResidentItemIncoming(
  db: AppDb,
  homeId: string,
): Map<string, number> {
  const rows = db
    .select({
      ownerId: homePurchaseOrderLines.ownerId,
      itemId: homePurchaseOrderLines.itemId,
      quantityOrderedBaseUnits: homePurchaseOrderLines.quantityOrderedBaseUnits,
      quantityReceivedBaseUnits: homePurchaseOrderLines.quantityReceivedBaseUnits,
    })
    .from(homePurchaseOrderLines)
    .innerJoin(
      homePurchaseOrders,
      eq(homePurchaseOrderLines.purchaseOrderId, homePurchaseOrders.id),
    )
    .where(
      and(
        eq(homePurchaseOrders.homeId, homeId),
        not(eq(homePurchaseOrders.status, "CLOSED")),
        eq(homePurchaseOrderLines.ownerType, "RESIDENT"),
        inArray(homePurchaseOrderLines.status, [...PENDING_PO_LINE_STATUSES]),
      ),
    )
    .all();

  const pending = new Map<string, number>();
  for (const row of rows) {
    const remaining =
      row.quantityOrderedBaseUnits - row.quantityReceivedBaseUnits;
    if (remaining <= 0) continue;
    const key = residentItemKey(row.ownerId, row.itemId);
    pending.set(key, (pending.get(key) ?? 0) + remaining);
  }
  return pending;
}

function roundOrderQuantity(
  quantity: number,
  unitClass: "countable" | "measurable",
): number {
  if (unitClass === "countable") {
    return Math.max(1, Math.ceil(quantity));
  }
  return Math.max(0.001, Math.round(quantity * 1000) / 1000);
}

function classifyScheduledUrgency(
  daysRemaining: number,
  daysThreshold: number,
): LowStockUrgency {
  if (daysRemaining < CRITICAL_DAYS_REMAINING) return "critical";
  if (daysRemaining < daysThreshold) return "warning";
  return "warning";
}

function classifyPrnUrgency(
  servingsRemaining: number,
  servingsThreshold: number,
): LowStockUrgency {
  if (servingsRemaining < CRITICAL_SERVINGS_REMAINING) return "critical";
  if (servingsRemaining < servingsThreshold) return "warning";
  return "warning";
}

export function getLowStockMedications(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
): LowStockMedicationItem[] {
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError("Home not found.");
  }
  assertActorMayAccessHome(db, actor, homeId);

  const daysThreshold = home.medLowStockDaysThreshold;
  const servingsThreshold = home.medLowStockServingsThreshold;
  const reorderDaysSupply = home.medReorderDaysSupply;
  const reorderServingsSupply = home.medReorderServingsSupply;
  const pendingIncoming = loadPendingResidentItemIncoming(db, homeId);

  const rows = db
    .select({
      rm: residentMedications,
      residentId: residents.id,
      residentName: residents.fullName,
      itemName: inventoryItems.name,
      unit: inventoryItems.baseUnit,
      unitClass: inventoryItems.unitClass,
      onHandBaseUnits: inventoryBalances.quantityBaseUnits,
    })
    .from(residentMedications)
    .innerJoin(residents, eq(residentMedications.residentId, residents.id))
    .innerJoin(inventoryItems, eq(residentMedications.itemId, inventoryItems.id))
    .leftJoin(
      inventoryBalances,
      and(
        eq(inventoryBalances.ownerType, "RESIDENT"),
        eq(inventoryBalances.ownerId, residents.id),
        eq(inventoryBalances.itemId, residentMedications.itemId),
      ),
    )
    .where(
      and(
        eq(residents.homeId, homeId),
        eq(residents.status, "active"),
        eq(residentMedications.status, "active"),
      ),
    )
    .orderBy(asc(residents.fullName), asc(inventoryItems.name))
    .all();

  const results: LowStockMedicationItem[] = [];

  for (const row of rows) {
    const onHandBaseUnits = row.onHandBaseUnits ?? 0;
    const pendingIncomingBaseUnits =
      pendingIncoming.get(residentItemKey(row.residentId, row.rm.itemId)) ?? 0;
    const effectiveOnHandBaseUnits = onHandBaseUnits + pendingIncomingBaseUnits;
    const unitClass = row.unitClass as "countable" | "measurable";
    const { rm } = row;

    if (rm.prn) {
      if (rm.quantityPerServing <= 0) continue;
      const servingsRemaining =
        effectiveOnHandBaseUnits / rm.quantityPerServing;
      if (servingsRemaining >= servingsThreshold) continue;

      const targetBaseUnits = rm.quantityPerServing * reorderServingsSupply;
      const suggestedOrderQuantityBaseUnits = roundOrderQuantity(
        Math.max(
          rm.quantityPerServing,
          targetBaseUnits - effectiveOnHandBaseUnits,
        ),
        unitClass,
      );

      results.push({
        residentId: row.residentId,
        residentName: row.residentName,
        residentMedicationId: rm.id,
        itemId: rm.itemId,
        itemName: row.itemName,
        unit: row.unit,
        unitClass,
        quantityPerServing: rm.quantityPerServing,
        prn: true,
        slotsPerDay: null,
        dailyBurn: null,
        onHandBaseUnits,
        pendingIncomingBaseUnits,
        effectiveOnHandBaseUnits,
        daysRemaining: null,
        servingsRemaining,
        threshold: servingsThreshold,
        urgency: classifyPrnUrgency(servingsRemaining, servingsThreshold),
        suggestedOrderQuantityBaseUnits,
      });
      continue;
    }

    const slots = resolveMedicationSlots({
      scheduledSlots: rm.scheduledSlots,
      servingsPerDay: rm.servingsPerDay,
      prn: false,
    });
    const slotsPerDay = slots.length;
    if (slotsPerDay === 0 || rm.quantityPerServing <= 0) continue;

    const dailyBurn = rm.quantityPerServing * slotsPerDay;
    const daysRemaining = effectiveOnHandBaseUnits / dailyBurn;
    if (daysRemaining >= daysThreshold) continue;

    const targetBaseUnits = dailyBurn * reorderDaysSupply;
    const suggestedOrderQuantityBaseUnits = roundOrderQuantity(
      Math.max(
        rm.quantityPerServing,
        targetBaseUnits - effectiveOnHandBaseUnits,
      ),
      unitClass,
    );

    results.push({
      residentId: row.residentId,
      residentName: row.residentName,
      residentMedicationId: rm.id,
      itemId: rm.itemId,
      itemName: row.itemName,
      unit: row.unit,
      unitClass,
      quantityPerServing: rm.quantityPerServing,
      prn: false,
      slotsPerDay,
      dailyBurn,
      onHandBaseUnits,
      pendingIncomingBaseUnits,
      effectiveOnHandBaseUnits,
      daysRemaining,
      servingsRemaining: null,
      threshold: daysThreshold,
      urgency: classifyScheduledUrgency(daysRemaining, daysThreshold),
      suggestedOrderQuantityBaseUnits,
    });
  }

  return results.sort((a, b) => {
    if (a.urgency !== b.urgency) {
      return a.urgency === "critical" ? -1 : 1;
    }
    const aMetric = a.daysRemaining ?? a.servingsRemaining ?? Infinity;
    const bMetric = b.daysRemaining ?? b.servingsRemaining ?? Infinity;
    return aMetric - bMetric;
  });
}
