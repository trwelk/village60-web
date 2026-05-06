import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  medicationOrderLines,
  medicationOrders,
  medications,
  residentMedicationStockEvents,
  residentMedications,
  residents,
} from "@/db/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import type { AppDb } from "@/lib/homes/service";
import { readMedicationOrderCoverageMonths } from "@/lib/medicationOrderSettings/service";
import { getResident } from "@/lib/residents/service";
import { computeMedicationOrderLineQty } from "./formula";

export type MedicationOrderStatus =
  | "pending"
  | "approved"
  | "order_placed"
  | "completed"
  | "rejected"
  | "cancelled";

export type MedicationOrderListRow = {
  id: string;
  homeId: string;
  residentId: string;
  residentFullName: string;
  status: MedicationOrderStatus;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};

export type MedicationOrderReceiptEvent = {
  id: string;
  amount: number;
  createdAtUtcMs: number;
  createdByUserId: string | null;
  idempotencyKey: string | null;
};

export type MedicationOrderLineDetail = {
  id: string;
  residentMedicationId: string;
  orderedQty: number;
  orderUnitLabel: string | null;
  receivedQty: number;
  closedShortAtUtcMs: number | null;
  closedShortReason: string | null;
  medicationId: string;
  name: string;
  strength: string;
  unit: string;
  receiptEvents: MedicationOrderReceiptEvent[];
};

export type MedicationOrderDetail = {
  order: {
    id: string;
    homeId: string;
    residentId: string;
    status: MedicationOrderStatus;
    createdByUserId: string | null;
    approvedByUserId: string | null;
    rejectedByUserId: string | null;
    cancelledByUserId: string | null;
    orderPlacedByUserId: string | null;
    approvedAtUtcMs: number | null;
    rejectedAtUtcMs: number | null;
    cancelledAtUtcMs: number | null;
    orderPlacedAtUtcMs: number | null;
    completedAtUtcMs: number | null;
    createdAtUtcMs: number;
    updatedAtUtcMs: number;
  };
  lines: MedicationOrderLineDetail[];
};

export type ActiveResidentMedicationOption = {
  residentMedicationId: string;
  medicationId: string;
  name: string;
  strength: string;
  unit: string;
  suggestedOrderedQty: number;
};

/** Serialize medication-order mutations and map SQLite contention to retryable conflicts (35c). */
function withImmediateMedicationWrite<T>(db: AppDb, fn: (tx: AppDb) => T): T {
  try {
    return db.transaction(fn, { behavior: "immediate" });
  } catch (e) {
    mapSqliteMedicationOrderWriteError(e);
  }
}

function mapSqliteMedicationOrderWriteError(e: unknown): never {
  if (e instanceof Database.SqliteError) {
    if (e.code === "SQLITE_BUSY" || e.code === "SQLITE_LOCKED") {
      throw new ConflictError(
        "Another medication order update is in progress. Please try again in a moment.",
      );
    }
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new ConflictError(
        "This medication order changed while saving. Please refresh and try again.",
      );
    }
  }
  throw e;
}

function requireActor(actor: SessionActor | undefined): asserts actor is SessionActor {
  if (!actor) {
    throw new ForbiddenError();
  }
}

function requireAdmin(actor: SessionActor): void {
  if (actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function requireAdminOrCare(actor: SessionActor): void {
  if (actor.role !== "admin" && actor.role !== "care") {
    throw new ForbiddenError();
  }
}

function assertPositiveIntQty(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError(`${label} must be a positive integer.`);
  }
}

function assertPositiveAmount(n: number, label: string): void {
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError(`${label} must be a positive number.`);
  }
}

function normalizeOrderUnitLabel(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type DesiredLine = { residentMedicationId: string; orderedQty: number };

function computeDesiredLines(
  db: AppDb,
  residentId: string,
  coverageMonths: number,
): DesiredLine[] {
  const rows = db
    .select()
    .from(residentMedications)
    .where(
      and(
        eq(residentMedications.residentId, residentId),
        eq(residentMedications.status, "active"),
      ),
    )
    .all();

  const out: DesiredLine[] = [];
  for (const rm of rows) {
    if (rm.minimumInStock == null) {
      continue;
    }
    const qty = computeMedicationOrderLineQty({
      minimumInStock: rm.minimumInStock,
      medicationOrderCoverageMonths: coverageMonths,
      currentStock: rm.currentStock,
    });
    if (qty > 0) {
      out.push({ residentMedicationId: rm.id, orderedQty: qty });
    }
  }
  return out;
}

function findEditableOrderForResident(
  db: AppDb,
  homeId: string,
  residentId: string,
): typeof medicationOrders.$inferSelect | undefined {
  return db
    .select()
    .from(medicationOrders)
    .where(
      and(
        eq(medicationOrders.homeId, homeId),
        eq(medicationOrders.residentId, residentId),
        inArray(medicationOrders.status, ["pending", "approved"]),
      ),
    )
    .orderBy(
      sql`case when ${medicationOrders.status} = 'pending' then 0 else 1 end`,
      desc(medicationOrders.updatedAtUtcMs),
    )
    .get();
}

function replaceOrderLines(
  db: AppDb,
  orderId: string,
  lines: DesiredLine[],
  now: number,
): void {
  db.delete(medicationOrderLines).where(eq(medicationOrderLines.orderId, orderId)).run();
  for (const line of lines) {
    db.insert(medicationOrderLines)
      .values({
        id: randomUUID(),
        orderId,
        residentMedicationId: line.residentMedicationId,
        orderedQty: line.orderedQty,
        receivedQty: 0,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
  }
}

function loadOrderForHome(
  db: AppDb,
  homeId: string,
  orderId: string,
): typeof medicationOrders.$inferSelect {
  const row = db.select().from(medicationOrders).where(eq(medicationOrders.id, orderId)).get();
  if (!row || row.homeId !== homeId) {
    throw new NotFoundError();
  }
  return row;
}

function loadOrderLineForOrder(
  db: AppDb,
  orderId: string,
  lineId: string,
): typeof medicationOrderLines.$inferSelect {
  const row = db.select().from(medicationOrderLines).where(eq(medicationOrderLines.id, lineId)).get();
  if (!row || row.orderId !== orderId) {
    throw new NotFoundError();
  }
  return row;
}

function tryCompleteMedicationOrderIfReady(db: AppDb, orderId: string, now: number): void {
  const o = db.select().from(medicationOrders).where(eq(medicationOrders.id, orderId)).get();
  if (!o || o.status !== "order_placed") {
    return;
  }
  const lines = db
    .select()
    .from(medicationOrderLines)
    .where(eq(medicationOrderLines.orderId, orderId))
    .all();
  if (lines.length === 0) {
    return;
  }
  for (const ln of lines) {
    const received = ln.receivedQty;
    const closed = ln.closedShortAtUtcMs != null;
    const fullyReceived = received > 0;
    if (!closed && !fullyReceived) {
      return;
    }
  }
  db.update(medicationOrders)
    .set({
      status: "completed",
      completedAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .where(eq(medicationOrders.id, orderId))
    .run();
}

export function createOrMergeMedicationOrderForResident(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): MedicationOrderDetail {
  getResident(db, actor, homeId, residentId);
  requireActor(actor);
  const coverageMonths = readMedicationOrderCoverageMonths(db);
  const desired = computeDesiredLines(db, residentId, coverageMonths);
  if (desired.length === 0) {
    throw new ConflictError("Nothing to order.");
  }

  const placedBlocker = db
    .select()
    .from(medicationOrders)
    .where(
      and(
        eq(medicationOrders.residentId, residentId),
        eq(medicationOrders.status, "order_placed"),
      ),
    )
    .get();
  if (placedBlocker) {
    throw new ConflictError(
      "An order is already placed for this resident; receive stock or cancel before building a new order.",
    );
  }

  const now = Date.now();

  return withImmediateMedicationWrite(db, (tx) => {
    const existing = tx
      .select()
      .from(medicationOrders)
      .where(
        and(
          eq(medicationOrders.residentId, residentId),
          inArray(medicationOrders.status, ["pending", "approved"]),
        ),
      )
      .get();

    let orderId: string;
    if (!existing) {
      orderId = randomUUID();
      tx.insert(medicationOrders)
        .values({
          id: orderId,
          homeId,
          residentId,
          status: "pending",
          createdByUserId: actor.userId,
          approvedByUserId: null,
          rejectedByUserId: null,
          cancelledByUserId: null,
          approvedAtUtcMs: null,
          rejectedAtUtcMs: null,
          cancelledAtUtcMs: null,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
    } else {
      if (existing.homeId !== homeId) {
        throw new NotFoundError();
      }
      orderId = existing.id;
      tx.update(medicationOrders)
        .set({ updatedAtUtcMs: now })
        .where(eq(medicationOrders.id, orderId))
        .run();
    }
    replaceOrderLines(tx, orderId, desired, now);
    return getMedicationOrderDetail(tx, actor, homeId, orderId);
  });
}


export function createOrMergeLowStockMedicationOrderForResident(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): MedicationOrderDetail {
  getResident(db, actor, homeId, residentId);
  requireActor(actor);
  const coverageMonths = readMedicationOrderCoverageMonths(db);

  // 1. Find below-min meds
  const activeMeds = db
    .select()
    .from(residentMedications)
    .where(
      and(
        eq(residentMedications.residentId, residentId),
        eq(residentMedications.status, "active"),
      ),
    )
    .all();

  const belowMinMeds = activeMeds.filter(
    (rm) => rm.minimumInStock != null && rm.currentStock < rm.minimumInStock,
  );

  if (belowMinMeds.length === 0) {
    throw new ConflictError("Nothing to order.");
  }

  // 2. Fetch in-flight remainder from order_placed lines
  const placedOrders = db
    .select({ id: medicationOrders.id })
    .from(medicationOrders)
    .where(
      and(
        eq(medicationOrders.residentId, residentId),
        eq(medicationOrders.status, "order_placed"),
      ),
    )
    .all();
  
  const placedOrderIds = placedOrders.map((o) => o.id);
  
  let inFlightLines: typeof medicationOrderLines.$inferSelect[] = [];
  if (placedOrderIds.length > 0) {
    inFlightLines = db
      .select()
      .from(medicationOrderLines)
      .where(inArray(medicationOrderLines.orderId, placedOrderIds))
      .all();
  }

  const inFlightRemainderByMed = new Map<string, number>();
  for (const line of inFlightLines) {
    if (line.closedShortAtUtcMs == null) {
      const remainder = line.receivedQty > 0 ? 0 : Math.max(0, line.orderedQty);
      const current = inFlightRemainderByMed.get(line.residentMedicationId) ?? 0;
      inFlightRemainderByMed.set(line.residentMedicationId, current + remainder);
    }
  }

  // 3. Compute desired lines
  const desired: DesiredLine[] = [];
  let allSufficient = true;

  for (const rm of belowMinMeds) {
    const inFlight = inFlightRemainderByMed.get(rm.id) ?? 0;
    const projectedStock = rm.currentStock + inFlight;
    
    // "if in-flight remainder is already sufficient, do not create anything"
    // Wait, is it sufficient if projectedStock >= minimumInStock?
    // Or is it sufficient if formulaQty <= 0?
    // The formula is based on minimumInStock * coverageMonths.
    // If projectedStock >= minimumInStock * coverageMonths, then formulaQty <= 0.
    const formulaQty = computeMedicationOrderLineQty({
      minimumInStock: rm.minimumInStock!,
      medicationOrderCoverageMonths: coverageMonths,
      currentStock: projectedStock,
    });

    if (formulaQty > 0) {
      allSufficient = false;
      desired.push({ residentMedicationId: rm.id, orderedQty: formulaQty });
    } else if (projectedStock < rm.minimumInStock!) {
      // Even with in-flight, it's below min? Wait, if formulaQty <= 0, it means projectedStock >= min * coverage.
      // So it's sufficient.
    }
  }

  if (desired.length === 0) {
    if (allSufficient && belowMinMeds.length > 0) {
      throw new ConflictError("Order placed, arriving stock is sufficient");
    }
    throw new ConflictError("Nothing to order.");
  }

  const now = Date.now();

  return withImmediateMedicationWrite(db, (tx) => {
    const existing = tx
      .select()
      .from(medicationOrders)
      .where(
        and(
          eq(medicationOrders.residentId, residentId),
          inArray(medicationOrders.status, ["pending", "approved"]),
        ),
      )
      .orderBy(
        sql`case when ${medicationOrders.status} = 'pending' then 0 else 1 end`,
        desc(medicationOrders.updatedAtUtcMs),
      )
      .get();

    const orderId = existing ? existing.id : randomUUID();

    if (!existing) {
      tx.insert(medicationOrders)
        .values({
          id: orderId,
          homeId,
          residentId,
          status: "pending",
          createdByUserId: actor.userId,
          approvedByUserId: null,
          rejectedByUserId: null,
          cancelledByUserId: null,
          orderPlacedByUserId: null,
          orderPlacedAtUtcMs: null,
          completedAtUtcMs: null,
          approvedAtUtcMs: null,
          rejectedAtUtcMs: null,
          cancelledAtUtcMs: null,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
    } else if (existing.homeId !== homeId) {
      throw new NotFoundError();
    }

    const existingLines = tx
      .select()
      .from(medicationOrderLines)
      .where(eq(medicationOrderLines.orderId, orderId))
      .all();
    const beforeQty = new Map(existingLines.map((l) => [l.residentMedicationId, l.orderedQty]));

    // Merge rule: max(existingOrderedQty, formulaQty), never auto-delete; upsert avoids duplicate lines under races (35c).
    for (const line of desired) {
      tx.insert(medicationOrderLines)
        .values({
          id: randomUUID(),
          orderId,
          residentMedicationId: line.residentMedicationId,
          orderedQty: line.orderedQty,
          receivedQty: 0,
          closedShortAtUtcMs: null,
          closedShortReason: null,
          closedShortByUserId: null,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .onConflictDoUpdate({
          target: [medicationOrderLines.orderId, medicationOrderLines.residentMedicationId],
          set: {
            orderedQty: sql`max(${medicationOrderLines.orderedQty}, excluded.ordered_qty)`,
            updatedAtUtcMs: now,
          },
        })
        .run();
    }

    const afterRows = tx
      .select()
      .from(medicationOrderLines)
      .where(eq(medicationOrderLines.orderId, orderId))
      .all();

    let changed = !existing;
    if (existing) {
      for (const d of desired) {
        const prev = beforeQty.get(d.residentMedicationId);
        const next = afterRows.find((r) => r.residentMedicationId === d.residentMedicationId)?.orderedQty;
        if (prev === undefined || (next != null && next > prev)) {
          changed = true;
          break;
        }
      }

      if (existing.status === "approved" && changed) {
        tx.update(medicationOrders)
          .set({
            status: "pending",
            approvedByUserId: null,
            approvedAtUtcMs: null,
            updatedAtUtcMs: now,
          })
          .where(eq(medicationOrders.id, orderId))
          .run();
      } else if (changed) {
        tx.update(medicationOrders)
          .set({ updatedAtUtcMs: now })
          .where(eq(medicationOrders.id, orderId))
          .run();
      }
    }

    return getMedicationOrderDetail(tx, actor, homeId, orderId);
  });
}


export function addMedicationOrderLineForResident(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  residentMedicationId: string,
  orderedQty: number,
  orderUnitLabel?: string | null,
): MedicationOrderDetail {
  const normalizedUnitLabel = normalizeOrderUnitLabel(orderUnitLabel);
  requireActor(actor);
  requireAdminOrCare(actor);
  assertActorMayAccessHome(db, actor, homeId);
  assertPositiveIntQty(orderedQty, "orderedQty");
  getResident(db, actor, homeId, residentId);

  const rm = db
    .select({
      rm: residentMedications,
      r: residents,
    })
    .from(residentMedications)
    .innerJoin(residents, eq(residentMedications.residentId, residents.id))
    .where(eq(residentMedications.id, residentMedicationId))
    .get();
  if (!rm || rm.rm.residentId !== residentId || rm.r.homeId !== homeId) {
    throw new NotFoundError();
  }
  if (rm.rm.status !== "active") {
    throw new ValidationError("Only active resident medications can be added to an order.");
  }

  const now = Date.now();
  return withImmediateMedicationWrite(db, (tx) => {
    const existing = findEditableOrderForResident(tx, homeId, residentId);
    let orderId = existing?.id;
    if (!orderId) {
      orderId = randomUUID();
      tx.insert(medicationOrders)
        .values({
          id: orderId,
          homeId,
          residentId,
          status: "pending",
          createdByUserId: actor.userId,
          approvedByUserId: null,
          rejectedByUserId: null,
          cancelledByUserId: null,
          approvedAtUtcMs: null,
          rejectedAtUtcMs: null,
          cancelledAtUtcMs: null,
          orderPlacedByUserId: null,
          orderPlacedAtUtcMs: null,
          completedAtUtcMs: null,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
    }

    tx.insert(medicationOrderLines)
      .values({
        id: randomUUID(),
        orderId,
        residentMedicationId,
        orderedQty,
        orderUnitLabel: normalizedUnitLabel,
        receivedQty: 0,
        closedShortAtUtcMs: null,
        closedShortReason: null,
        closedShortByUserId: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .onConflictDoUpdate({
        target: [medicationOrderLines.orderId, medicationOrderLines.residentMedicationId],
        set: {
          orderedQty: sql`max(${medicationOrderLines.orderedQty}, excluded.ordered_qty)`,
          orderUnitLabel: sql`coalesce(excluded.order_unit_label, ${medicationOrderLines.orderUnitLabel})`,
          updatedAtUtcMs: now,
        },
      })
      .run();

    if (existing?.status === "approved") {
      tx.update(medicationOrders)
        .set({
          status: "pending",
          approvedByUserId: null,
          approvedAtUtcMs: null,
          updatedAtUtcMs: now,
        })
        .where(eq(medicationOrders.id, orderId))
        .run();
    } else {
      tx.update(medicationOrders)
        .set({ updatedAtUtcMs: now })
        .where(eq(medicationOrders.id, orderId))
        .run();
    }
    return getMedicationOrderDetail(tx, actor, homeId, orderId);
  });
}

export function listMedicationOrdersForHome(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  filters: { status?: MedicationOrderStatus; residentId?: string },
): MedicationOrderListRow[] {
  requireActor(actor);
  assertActorMayAccessHome(db, actor, homeId);
  if (filters.residentId) {
    getResident(db, actor, homeId, filters.residentId);
  }

  const parts = [eq(medicationOrders.homeId, homeId)];
  if (filters.status) {
    parts.push(eq(medicationOrders.status, filters.status));
  }
  if (filters.residentId) {
    parts.push(eq(medicationOrders.residentId, filters.residentId));
  }
  const whereExpr = parts.length === 1 ? parts[0]! : and(...parts);

  const rows = db
    .select({
      o: medicationOrders,
      r: residents,
    })
    .from(medicationOrders)
    .innerJoin(residents, eq(medicationOrders.residentId, residents.id))
    .where(whereExpr)
    .orderBy(desc(medicationOrders.updatedAtUtcMs), desc(medicationOrders.id))
    .all();

  return rows.map(({ o, r }) => ({
    id: o.id,
    homeId: o.homeId,
    residentId: o.residentId,
    residentFullName: r.fullName,
    status: o.status as MedicationOrderStatus,
    createdAtUtcMs: o.createdAtUtcMs,
    updatedAtUtcMs: o.updatedAtUtcMs,
  }));
}

export function listActiveResidentMedicationOptionsForOrder(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): ActiveResidentMedicationOption[] {
  requireActor(actor);
  requireAdminOrCare(actor);
  assertActorMayAccessHome(db, actor, homeId);
  getResident(db, actor, homeId, residentId);

  const coverageMonths = readMedicationOrderCoverageMonths(db);
  const rows = db
    .select({
      rm: residentMedications,
      m: medications,
    })
    .from(residentMedications)
    .innerJoin(medications, eq(residentMedications.medicationId, medications.id))
    .where(
      and(
        eq(residentMedications.residentId, residentId),
        eq(residentMedications.status, "active"),
      ),
    )
    .orderBy(
      asc(medications.name),
      asc(medications.strength),
      asc(medications.unit),
      asc(residentMedications.id),
    )
    .all();

  return rows.map(({ rm, m }) => ({
    residentMedicationId: rm.id,
    medicationId: rm.medicationId,
    name: m.name,
    strength: m.strength,
    unit: m.unit,
    suggestedOrderedQty:
      rm.minimumInStock == null
        ? 1
        : Math.max(
            1,
            computeMedicationOrderLineQty({
              minimumInStock: rm.minimumInStock,
              medicationOrderCoverageMonths: coverageMonths,
              currentStock: rm.currentStock,
            }),
          ),
  }));
}

export function getMedicationOrderDetail(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
): MedicationOrderDetail {
  requireActor(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const o = loadOrderForHome(db, homeId, orderId);
  const lineRows = db
    .select({
      line: medicationOrderLines,
      rm: residentMedications,
      m: medications,
    })
    .from(medicationOrderLines)
    .innerJoin(
      residentMedications,
      eq(medicationOrderLines.residentMedicationId, residentMedications.id),
    )
    .innerJoin(medications, eq(residentMedications.medicationId, medications.id))
    .where(eq(medicationOrderLines.orderId, orderId))
    .orderBy(asc(medicationOrderLines.id))
    .all();

  const lineIds = lineRows.map(({ line }) => line.id);
  const receiptRows =
    lineIds.length === 0
      ? []
      : db
          .select()
          .from(residentMedicationStockEvents)
          .where(inArray(residentMedicationStockEvents.medicationOrderLineId, lineIds))
          .orderBy(
            asc(residentMedicationStockEvents.medicationOrderLineId),
            asc(residentMedicationStockEvents.createdAtUtcMs),
          )
          .all();

  const receiptsByLineId = new Map<string, MedicationOrderReceiptEvent[]>();
  for (const ev of receiptRows) {
    const lid = ev.medicationOrderLineId;
    if (!lid) continue;
    const rec: MedicationOrderReceiptEvent = {
      id: ev.id,
      amount: ev.amount,
      createdAtUtcMs: ev.createdAtUtcMs,
      createdByUserId: ev.createdByUserId,
      idempotencyKey: ev.idempotencyKey,
    };
    const arr = receiptsByLineId.get(lid);
    if (arr) {
      arr.push(rec);
    } else {
      receiptsByLineId.set(lid, [rec]);
    }
  }

  return {
    order: {
      id: o.id,
      homeId: o.homeId,
      residentId: o.residentId,
      status: o.status as MedicationOrderStatus,
      createdByUserId: o.createdByUserId,
      approvedByUserId: o.approvedByUserId,
      rejectedByUserId: o.rejectedByUserId,
      cancelledByUserId: o.cancelledByUserId,
      orderPlacedByUserId: o.orderPlacedByUserId,
      approvedAtUtcMs: o.approvedAtUtcMs,
      rejectedAtUtcMs: o.rejectedAtUtcMs,
      cancelledAtUtcMs: o.cancelledAtUtcMs,
      orderPlacedAtUtcMs: o.orderPlacedAtUtcMs,
      completedAtUtcMs: o.completedAtUtcMs,
      createdAtUtcMs: o.createdAtUtcMs,
      updatedAtUtcMs: o.updatedAtUtcMs,
    },
    lines: lineRows.map(({ line, rm, m }) => ({
      id: line.id,
      residentMedicationId: line.residentMedicationId,
      orderedQty: line.orderedQty,
      orderUnitLabel: line.orderUnitLabel,
      receivedQty: line.receivedQty,
      closedShortAtUtcMs: line.closedShortAtUtcMs,
      closedShortReason: line.closedShortReason,
      medicationId: rm.medicationId,
      name: m.name,
      strength: m.strength,
      unit: m.unit,
      receiptEvents: receiptsByLineId.get(line.id) ?? [],
    })),
  };
}

export function cancelMedicationOrder(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
): MedicationOrderDetail {
  requireActor(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const o = loadOrderForHome(db, homeId, orderId);
  const now = Date.now();

  if (o.status === "pending") {
    if (actor.role !== "admin" && actor.role !== "care") {
      throw new ForbiddenError();
    }
  } else if (o.status === "approved") {
    requireAdmin(actor);
  } else if (o.status === "order_placed") {
    requireAdmin(actor);
    const lines = db
      .select()
      .from(medicationOrderLines)
      .where(eq(medicationOrderLines.orderId, orderId))
      .all();
    for (const ln of lines) {
      if (ln.receivedQty > 0) {
        throw new ValidationError("Cannot cancel an order that has receipts.");
      }
    }
  } else {
    throw new ValidationError("Only pending, approved, or placed orders can be cancelled.");
  }

  db.update(medicationOrders)
    .set({
      status: "cancelled",
      cancelledByUserId: actor.userId,
      cancelledAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .where(eq(medicationOrders.id, orderId))
    .run();

  return getMedicationOrderDetail(db, actor, homeId, orderId);
}

export function approveMedicationOrder(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
): MedicationOrderDetail {
  requireActor(actor);
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const o = loadOrderForHome(db, homeId, orderId);
  if (o.status !== "pending") {
    throw new ValidationError("Only pending orders can be approved.");
  }
  const now = Date.now();
  db.update(medicationOrders)
    .set({
      status: "approved",
      approvedByUserId: actor.userId,
      approvedAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .where(eq(medicationOrders.id, orderId))
    .run();
  return getMedicationOrderDetail(db, actor, homeId, orderId);
}

export function rejectMedicationOrder(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
): MedicationOrderDetail {
  requireActor(actor);
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const o = loadOrderForHome(db, homeId, orderId);
  if (o.status !== "pending") {
    throw new ValidationError("Only pending orders can be rejected.");
  }
  const now = Date.now();
  db.update(medicationOrders)
    .set({
      status: "rejected",
      rejectedByUserId: actor.userId,
      rejectedAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .where(eq(medicationOrders.id, orderId))
    .run();
  return getMedicationOrderDetail(db, actor, homeId, orderId);
}

export function placeMedicationOrder(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
): MedicationOrderDetail {
  requireActor(actor);
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const o = loadOrderForHome(db, homeId, orderId);
  if (o.status !== "approved") {
    throw new ValidationError("Only approved orders can be placed with the vendor.");
  }
  const now = Date.now();
  db.update(medicationOrders)
    .set({
      status: "order_placed",
      orderPlacedAtUtcMs: now,
      orderPlacedByUserId: actor.userId,
      updatedAtUtcMs: now,
    })
    .where(eq(medicationOrders.id, orderId))
    .run();
  return getMedicationOrderDetail(db, actor, homeId, orderId);
}

export function receiveMedicationOrderLine(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
  lineId: string,
  input: { amount: number; idempotencyKey?: string | null },
): MedicationOrderDetail {
  requireActor(actor);
  requireAdminOrCare(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const orderRow = loadOrderForHome(db, homeId, orderId);
  const line = loadOrderLineForOrder(db, orderId, lineId);
  const trimmedKey =
    input.idempotencyKey !== undefined &&
    input.idempotencyKey !== null &&
    String(input.idempotencyKey).trim() !== ""
      ? String(input.idempotencyKey).trim()
      : null;

  if (trimmedKey) {
    const existingEv = db
      .select()
      .from(residentMedicationStockEvents)
      .where(
        and(
          eq(residentMedicationStockEvents.medicationOrderLineId, lineId),
          eq(residentMedicationStockEvents.idempotencyKey, trimmedKey),
        ),
      )
      .get();
    if (existingEv) {
      return getMedicationOrderDetail(db, actor, homeId, orderId);
    }
  }

  if (orderRow.status !== "order_placed") {
    throw new ValidationError("Receipts can only be posted while the order is placed.");
  }

  assertPositiveAmount(input.amount, "amount");
  const amount = input.amount;

  if (line.closedShortAtUtcMs != null) {
    throw new ValidationError("This line was closed short; further receipts are not allowed.");
  }

  const rm = db
    .select()
    .from(residentMedications)
    .where(eq(residentMedications.id, line.residentMedicationId))
    .get();
  if (!rm) {
    throw new NotFoundError();
  }

  const now = Date.now();
  const newReceived = line.receivedQty + amount;
  const newStock = rm.currentStock + amount;

  withImmediateMedicationWrite(db, (tx) => {
    tx.insert(residentMedicationStockEvents)
      .values({
        id: randomUUID(),
        residentMedicationId: line.residentMedicationId,
        eventType: "delivery",
        amount,
        medicationOrderLineId: lineId,
        idempotencyKey: trimmedKey,
        createdAtUtcMs: now,
        createdByUserId: actor.userId,
      })
      .run();
    tx.update(residentMedications)
      .set({ currentStock: newStock, updatedAtUtcMs: now })
      .where(eq(residentMedications.id, line.residentMedicationId))
      .run();
    tx.update(medicationOrderLines)
      .set({ receivedQty: newReceived, updatedAtUtcMs: now })
      .where(eq(medicationOrderLines.id, lineId))
      .run();
    tx.update(medicationOrders)
      .set({ updatedAtUtcMs: now })
      .where(eq(medicationOrders.id, orderId))
      .run();
    tryCompleteMedicationOrderIfReady(tx, orderId, now);
  });

  return getMedicationOrderDetail(db, actor, homeId, orderId);
}

export function closeMedicationOrderLineShort(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
  lineId: string,
  input: { reason: string },
): MedicationOrderDetail {
  requireActor(actor);
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const orderRow = loadOrderForHome(db, homeId, orderId);
  if (orderRow.status !== "order_placed") {
    throw new ValidationError("Lines can only be closed short while the order is placed.");
  }

  const line = loadOrderLineForOrder(db, orderId, lineId);
  if (line.closedShortAtUtcMs != null) {
    throw new ValidationError("This line is already closed short.");
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length === 0) {
    throw new ValidationError("A reason is required to close a line short.");
  }

  const now = Date.now();
  withImmediateMedicationWrite(db, (tx) => {
    tx.update(medicationOrderLines)
      .set({
        closedShortAtUtcMs: now,
        closedShortReason: reason,
        closedShortByUserId: actor.userId,
        updatedAtUtcMs: now,
      })
      .where(eq(medicationOrderLines.id, lineId))
      .run();
    tx.update(medicationOrders)
      .set({ updatedAtUtcMs: now })
      .where(eq(medicationOrders.id, orderId))
      .run();
    tryCompleteMedicationOrderIfReady(tx, orderId, now);
  });

  return getMedicationOrderDetail(db, actor, homeId, orderId);
}

export function unapproveMedicationOrder(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
): MedicationOrderDetail {
  requireActor(actor);
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const o = loadOrderForHome(db, homeId, orderId);
  if (o.status !== "approved") {
    throw new ValidationError("Only approved orders can be moved back to pending.");
  }
  const now = Date.now();
  db.update(medicationOrders)
    .set({
      status: "pending",
      approvedByUserId: null,
      approvedAtUtcMs: null,
      updatedAtUtcMs: now,
    })
    .where(eq(medicationOrders.id, orderId))
    .run();
  return getMedicationOrderDetail(db, actor, homeId, orderId);
}

export function patchMedicationOrderApprovedLineQtys(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
  lineQtyByResidentMedicationId: Record<string, number>,
): MedicationOrderDetail {
  requireActor(actor);
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const entries = Object.entries(lineQtyByResidentMedicationId);
  if (entries.length === 0) {
    throw new ValidationError("No line updates provided.");
  }

  return withImmediateMedicationWrite(db, (tx) => {
    const o = loadOrderForHome(tx, homeId, orderId);
    if (o.status !== "approved") {
      throw new ValidationError("Line quantities can only be edited on approved orders.");
    }

    const existingLines = tx
      .select()
      .from(medicationOrderLines)
      .where(eq(medicationOrderLines.orderId, orderId))
      .all();
    const allowedIds = new Set(existingLines.map((l) => l.residentMedicationId));
    for (const [residentMedicationId, qty] of entries) {
      if (!allowedIds.has(residentMedicationId)) {
        throw new ValidationError(
          "Ordered quantities may only be updated for medications already on this order.",
        );
      }
      assertPositiveIntQty(qty, "orderedQty");
    }

    const now = Date.now();
    for (const [residentMedicationId, qty] of entries) {
      tx.update(medicationOrderLines)
        .set({ orderedQty: qty, updatedAtUtcMs: now })
        .where(
          and(
            eq(medicationOrderLines.orderId, orderId),
            eq(medicationOrderLines.residentMedicationId, residentMedicationId),
          ),
        )
        .run();
    }
    tx.update(medicationOrders)
      .set({ updatedAtUtcMs: now })
      .where(eq(medicationOrders.id, orderId))
      .run();
    return getMedicationOrderDetail(tx, actor, homeId, orderId);
  });
}

export function updateMedicationOrderLineQty(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
  lineId: string,
  orderedQty: number,
  orderUnitLabel?: string | null,
): MedicationOrderDetail {
  requireActor(actor);
  requireAdminOrCare(actor);
  assertActorMayAccessHome(db, actor, homeId);
  assertPositiveIntQty(orderedQty, "orderedQty");

  const normalizedUnitLabel = normalizeOrderUnitLabel(orderUnitLabel);

  return withImmediateMedicationWrite(db, (tx) => {
    const order = loadOrderForHome(tx, homeId, orderId);
    if (order.status !== "pending" && order.status !== "approved") {
      throw new ValidationError("Lines can only be edited on pending or approved orders.");
    }
    const line = loadOrderLineForOrder(tx, orderId, lineId);
    const now = Date.now();
    tx.update(medicationOrderLines)
      .set({ orderedQty, orderUnitLabel: normalizedUnitLabel, updatedAtUtcMs: now })
      .where(eq(medicationOrderLines.id, line.id))
      .run();
    if (order.status === "approved") {
      tx.update(medicationOrders)
        .set({
          status: "pending",
          approvedByUserId: null,
          approvedAtUtcMs: null,
          updatedAtUtcMs: now,
        })
        .where(eq(medicationOrders.id, orderId))
        .run();
    } else {
      tx.update(medicationOrders)
        .set({ updatedAtUtcMs: now })
        .where(eq(medicationOrders.id, orderId))
        .run();
    }
    return getMedicationOrderDetail(tx, actor, homeId, orderId);
  });
}

export function removeMedicationOrderLine(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  orderId: string,
  lineId: string,
): MedicationOrderDetail {
  requireActor(actor);
  requireAdminOrCare(actor);
  assertActorMayAccessHome(db, actor, homeId);

  return withImmediateMedicationWrite(db, (tx) => {
    const order = loadOrderForHome(tx, homeId, orderId);
    if (order.status !== "pending" && order.status !== "approved") {
      throw new ValidationError("Lines can only be removed from pending or approved orders.");
    }
    loadOrderLineForOrder(tx, orderId, lineId);
    const now = Date.now();
    tx.delete(medicationOrderLines).where(eq(medicationOrderLines.id, lineId)).run();
    const remaining = tx
      .select({ id: medicationOrderLines.id })
      .from(medicationOrderLines)
      .where(eq(medicationOrderLines.orderId, orderId))
      .all();
    if (remaining.length === 0) {
      tx.update(medicationOrders)
        .set({
          status: "cancelled",
          cancelledByUserId: actor.userId,
          cancelledAtUtcMs: now,
          approvedByUserId: null,
          approvedAtUtcMs: null,
          updatedAtUtcMs: now,
        })
        .where(eq(medicationOrders.id, orderId))
        .run();
    } else if (order.status === "approved") {
      tx.update(medicationOrders)
        .set({
          status: "pending",
          approvedByUserId: null,
          approvedAtUtcMs: null,
          updatedAtUtcMs: now,
        })
        .where(eq(medicationOrders.id, orderId))
        .run();
    } else {
      tx.update(medicationOrders)
        .set({ updatedAtUtcMs: now })
        .where(eq(medicationOrders.id, orderId))
        .run();
    }
    return getMedicationOrderDetail(tx, actor, homeId, orderId);
  });
}
