import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  homes,
  otherCharges,
  residentMonthlyCharges,
  residentPayments,
  residents,
  users,
  wards,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import {
  BillingBatchError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import { parseBillingMonth } from "./billingMonth";
import { getResident } from "@/lib/residents/service";

function requireBillingAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

const MAX_BILLING_MONTHS_PER_BATCH = 40;

function parsePaidOn(raw: string): string {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError("paidOn must be an ISO date (YYYY-MM-DD).");
  }
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError("paidOn is not a valid calendar date.");
  }
  return s;
}

function defaultPaidOnUtcDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function resolveBatchPaidOn(raw: string | undefined | null): string {
  if (raw === undefined || raw === null || raw.trim() === "") {
    return defaultPaidOnUtcDate();
  }
  return parsePaidOn(raw);
}

export type ResidentMonthlyChargeListItem = {
  id: string;
  billingMonth: string;
  wardIdSnapshot: string;
  wardLabel: string | null;
  amountMinorSnapshot: number;
  paid: boolean;
  payment: null | {
    id: string;
    amountMinor: number;
    paidOn: string;
    notes: string | null;
    recordedByUserId: string;
    createdAtUtcMs: number;
    updatedAtUtcMs: number;
  };
};

export type HomeMonthlyChargeLedgerRow = ResidentMonthlyChargeListItem & {
  residentId: string;
  residentFullName: string;
  residentStatus: string;
};

/** Query param + SQL filter for dashboard/API (18d → 22c server-side). */
export type HomeMonthlyChargesLedgerPaymentStatusFilter =
  | "all"
  | "paid"
  | "unpaid";

export type HomeMonthlyChargesLedgerSummary = {
  totalBilledMinor: number;
  chargeCount: number;
  paidCount: number;
  unpaidCount: number;
  unpaidBalanceMinor: number;
};

/** Shared with monthly payment ledger (20a); max caps server work per request. */
export const DEFAULT_CHARGES_LEDGER_PAGE_SIZE = 25;
export const MAX_CHARGES_LEDGER_PAGE_SIZE = 100;

export type HomeOtherChargeLedgerRow = {
  id: string;
  type: "registration" | "deposit";
  amountMinor: number;
  received: boolean;
  paidOn: string | null;
  residentId: string;
  residentFullName: string;
  residentStatus: string;
};

export type HomeOtherChargesReceivedFilter = "all" | "unpaid" | "paid";

export type HomeOtherChargesLedgerSummary = {
  totalAmountMinor: number;
  outstandingAmountMinor: number;
  receivedLineCount: number;
};

export type UnpaidMonthlyChargeWorklistRow = {
  id: string;
  billingMonth: string;
  amountMinorSnapshot: number;
  wardLabel: string | null;
};

export type HomeUnpaidMonthlyChargesWorklistEntry = {
  residentId: string;
  residentFullName: string;
  residentStatus: string;
  oldestUnpaidBillingMonth: string;
  totalUnpaidMinor: number;
  unpaidCharges: UnpaidMonthlyChargeWorklistRow[];
};

function assertChargeInResidentHome(
  db: AppDb,
  homeId: string,
  residentId: string,
  chargeId: string,
): typeof residentMonthlyCharges.$inferSelect {
  const charge = db
    .select()
    .from(residentMonthlyCharges)
    .where(eq(residentMonthlyCharges.id, chargeId))
    .get();
  if (!charge || charge.residentId !== residentId) {
    throw new NotFoundError();
  }
  const res = db
    .select()
    .from(residents)
    .where(eq(residents.id, residentId))
    .get();
  if (!res || res.homeId !== homeId) {
    throw new NotFoundError();
  }
  return charge;
}

export function listHomeMonthlyChargesLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: {
    billingMonthFrom: string;
    billingMonthTo: string;
    paymentStatus?: HomeMonthlyChargesLedgerPaymentStatusFilter;
    page: number;
    pageSize: number;
  },
): {
  rows: HomeMonthlyChargeLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeMonthlyChargesLedgerSummary;
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }

  const paymentStatus = input.paymentStatus ?? "all";
  const page = Math.max(1, Math.floor(input.page) || 1);
  const rawSize =
    Math.floor(input.pageSize) || DEFAULT_CHARGES_LEDGER_PAGE_SIZE;
  const pageSize = Math.min(
    MAX_CHARGES_LEDGER_PAGE_SIZE,
    Math.max(1, rawSize),
  );
  const offset = (page - 1) * pageSize;

  const paymentCond =
    paymentStatus === "paid"
      ? isNotNull(residentPayments.id)
      : paymentStatus === "unpaid"
        ? isNull(residentPayments.id)
        : undefined;

  const conds = [
    eq(residents.homeId, homeId),
    gte(residentMonthlyCharges.billingMonth, input.billingMonthFrom),
    lte(residentMonthlyCharges.billingMonth, input.billingMonthTo),
    paymentCond,
  ].filter((c): c is NonNullable<typeof c> => c != null);

  const metaRow = db
    .select({
      totalCount: count(),
      totalBilledMinor: sql<number>`ifnull(sum(${residentMonthlyCharges.amountMinorSnapshot}), 0)`,
      paidCount: sql<number>`ifnull(sum(case when ${residentPayments.id} is not null then 1 else 0 end), 0)`,
      unpaidBalanceMinor: sql<number>`ifnull(sum(case when ${residentPayments.id} is null then ${residentMonthlyCharges.amountMinorSnapshot} else 0 end), 0)`,
    })
    .from(residentMonthlyCharges)
    .innerJoin(residents, eq(residents.id, residentMonthlyCharges.residentId))
    .leftJoin(
      residentPayments,
      eq(
        residentPayments.residentMonthlyChargeId,
        residentMonthlyCharges.id,
      ),
    )
    .where(and(...conds))
    .get();

  const totalCount = Number(metaRow?.totalCount ?? 0);
  const paidCount = Number(metaRow?.paidCount ?? 0);
  const summary: HomeMonthlyChargesLedgerSummary = {
    totalBilledMinor: Number(metaRow?.totalBilledMinor ?? 0),
    chargeCount: totalCount,
    paidCount,
    unpaidCount: totalCount - paidCount,
    unpaidBalanceMinor: Number(metaRow?.unpaidBalanceMinor ?? 0),
  };

  const dataRows = db
    .select({
      charge: residentMonthlyCharges,
      payment: residentPayments,
      wardLabel: wards.label,
      residentFullName: residents.fullName,
      residentStatus: residents.status,
      residentId: residents.id,
    })
    .from(residentMonthlyCharges)
    .innerJoin(residents, eq(residents.id, residentMonthlyCharges.residentId))
    .leftJoin(
      residentPayments,
      eq(
        residentPayments.residentMonthlyChargeId,
        residentMonthlyCharges.id,
      ),
    )
    .leftJoin(wards, eq(wards.id, residentMonthlyCharges.wardIdSnapshot))
    .where(and(...conds))
    .orderBy(
      desc(residentMonthlyCharges.billingMonth),
      asc(residents.fullName),
      asc(residentMonthlyCharges.id),
    )
    .limit(pageSize)
    .offset(offset)
    .all();

  const rows: HomeMonthlyChargeLedgerRow[] = dataRows.map((r) => ({
    id: r.charge.id,
    residentId: r.residentId,
    residentFullName: r.residentFullName,
    residentStatus: r.residentStatus,
    billingMonth: r.charge.billingMonth,
    wardIdSnapshot: r.charge.wardIdSnapshot,
    wardLabel: r.wardLabel ?? null,
    amountMinorSnapshot: r.charge.amountMinorSnapshot,
    paid: r.payment != null,
    payment:
      r.payment == null
        ? null
        : {
            id: r.payment.id,
            amountMinor: r.payment.amountMinor,
            paidOn: r.payment.paidOn,
            notes: r.payment.notes,
            recordedByUserId: r.payment.recordedByUserId,
            createdAtUtcMs: r.payment.createdAtUtcMs,
            updatedAtUtcMs: r.payment.updatedAtUtcMs,
          },
  }));

  return { rows, totalCount, page, pageSize, summary };
}

/**
 * Home-scoped one-off charges (registration, deposit) for the dashboard ledger (21c, 22d).
 * Admin only; filters applied before pagination; aggregate summary is over the full filtered set.
 */
export function listHomeOtherChargesLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  options: {
    residentId?: string | null;
    receivedFilter: HomeOtherChargesReceivedFilter;
    page: number;
    pageSize: number;
  },
): {
  rows: HomeOtherChargeLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeOtherChargesLedgerSummary;
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }

  const page = Math.max(1, Math.floor(options.page) || 1);
  const rawSize =
    Math.floor(options.pageSize) || DEFAULT_CHARGES_LEDGER_PAGE_SIZE;
  const pageSize = Math.min(
    MAX_CHARGES_LEDGER_PAGE_SIZE,
    Math.max(1, rawSize),
  );
  const offset = (page - 1) * pageSize;

  const rid = options.residentId?.trim() ?? "";
  if (rid) {
    getResident(db, actor, homeId, rid);
  }

  const typeKnown = or(
    eq(otherCharges.type, "registration"),
    eq(otherCharges.type, "deposit"),
  );
  const homeCond = eq(residents.homeId, homeId);
  const residentCond = rid ? eq(residents.id, rid) : undefined;
  const receivedCond =
    options.receivedFilter === "all"
      ? undefined
      : options.receivedFilter === "unpaid"
        ? eq(otherCharges.received, false)
        : eq(otherCharges.received, true);

  const conds = [homeCond, typeKnown, residentCond, receivedCond].filter(
    (c): c is NonNullable<typeof c> => c != null,
  );

  const summaryRow = db
    .select({
      totalCount: count(),
      totalAmountMinor: sql<number>`ifnull(sum(${otherCharges.amountMinor}), 0)`,
      outstandingAmountMinor: sql<number>`ifnull(sum(case when ${otherCharges.received} = 0 then ${otherCharges.amountMinor} else 0 end), 0)`,
      receivedLineCount: sql<number>`ifnull(sum(case when ${otherCharges.received} = 1 then 1 else 0 end), 0)`,
    })
    .from(otherCharges)
    .innerJoin(residents, eq(residents.id, otherCharges.residentId))
    .where(and(...conds))
    .get();

  const totalCount = Number(summaryRow?.totalCount ?? 0);
  const summary: HomeOtherChargesLedgerSummary = {
    totalAmountMinor: Number(summaryRow?.totalAmountMinor ?? 0),
    outstandingAmountMinor: Number(summaryRow?.outstandingAmountMinor ?? 0),
    receivedLineCount: Number(summaryRow?.receivedLineCount ?? 0),
  };

  const dataRows = db
    .select({
      charge: otherCharges,
      residentFullName: residents.fullName,
      residentStatus: residents.status,
      residentId: residents.id,
    })
    .from(otherCharges)
    .innerJoin(residents, eq(residents.id, otherCharges.residentId))
    .where(and(...conds))
    .orderBy(
      asc(residents.fullName),
      sql`(case ${otherCharges.type} when 'registration' then 0 when 'deposit' then 1 else 2 end)`,
      asc(otherCharges.id),
    )
    .limit(pageSize)
    .offset(offset)
    .all();

  const rows: HomeOtherChargeLedgerRow[] = dataRows.map((r) => ({
    id: r.charge.id,
    type: r.charge.type as "registration" | "deposit",
    amountMinor: r.charge.amountMinor,
    received: r.charge.received,
    paidOn: r.charge.paidOn ?? null,
    residentId: r.residentId,
    residentFullName: r.residentFullName,
    residentStatus: r.residentStatus,
  }));

  return { rows, totalCount, page, pageSize, summary };
}

export const DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE = DEFAULT_CHARGES_LEDGER_PAGE_SIZE;
export const MAX_PAYMENTS_LEDGER_PAGE_SIZE = MAX_CHARGES_LEDGER_PAGE_SIZE;

export type HomeMonthlyPaymentLedgerRow = {
  paymentId: string;
  paidOn: string;
  amountMinor: number;
  notes: string | null;
  billingMonth: string;
  amountMinorSnapshot: number;
  residentId: string;
  residentFullName: string;
  residentStatus: string;
  /** Admin user email; no separate display name on `users` in v1. */
  recordedByEmail: string;
};

/**
 * All recorded monthly-bill payments for a home, newest by paid date first.
 * Admin-only; same access rules as other home billing lists.
 */
export function listHomeMonthlyPaymentsLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  options: { page: number; pageSize: number },
): {
  rows: HomeMonthlyPaymentLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }

  const page = Math.max(1, Math.floor(options.page) || 1);
  const rawSize =
    Math.floor(options.pageSize) || DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE;
  const pageSize = Math.min(
    MAX_PAYMENTS_LEDGER_PAGE_SIZE,
    Math.max(1, rawSize),
  );
  const offset = (page - 1) * pageSize;

  const homeScope = eq(residents.homeId, homeId);

  const countRow = db
    .select({ n: count() })
    .from(residentPayments)
    .innerJoin(
      residentMonthlyCharges,
      eq(
        residentPayments.residentMonthlyChargeId,
        residentMonthlyCharges.id,
      ),
    )
    .innerJoin(
      residents,
      eq(residents.id, residentMonthlyCharges.residentId),
    )
    .where(homeScope)
    .get();
  const totalCount = Number(countRow?.n ?? 0);

  const dataRows = db
    .select({
      payment: residentPayments,
      charge: residentMonthlyCharges,
      residentId: residents.id,
      residentFullName: residents.fullName,
      residentStatus: residents.status,
      recordedByEmail: users.email,
    })
    .from(residentPayments)
    .innerJoin(
      residentMonthlyCharges,
      eq(
        residentPayments.residentMonthlyChargeId,
        residentMonthlyCharges.id,
      ),
    )
    .innerJoin(
      residents,
      eq(residents.id, residentMonthlyCharges.residentId),
    )
    .innerJoin(
      users,
      eq(users.id, residentPayments.recordedByUserId),
    )
    .where(homeScope)
    .orderBy(
      desc(residentPayments.paidOn),
      desc(residentPayments.createdAtUtcMs),
    )
    .limit(pageSize)
    .offset(offset)
    .all();

  const rows: HomeMonthlyPaymentLedgerRow[] = dataRows.map((r) => ({
    paymentId: r.payment.id,
    paidOn: r.payment.paidOn,
    amountMinor: r.payment.amountMinor,
    notes: r.payment.notes,
    billingMonth: r.charge.billingMonth,
    amountMinorSnapshot: r.charge.amountMinorSnapshot,
    residentId: r.residentId,
    residentFullName: r.residentFullName,
    residentStatus: r.residentStatus,
    recordedByEmail: r.recordedByEmail,
  }));

  return { rows, totalCount, page, pageSize };
}

export function listHomeUnpaidMonthlyChargesWorklist(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): HomeUnpaidMonthlyChargesWorklistEntry[] {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }

  const rows = db
    .select({
      residentId: residents.id,
      residentFullName: residents.fullName,
      residentStatus: residents.status,
      chargeId: residentMonthlyCharges.id,
      billingMonth: residentMonthlyCharges.billingMonth,
      amountMinorSnapshot: residentMonthlyCharges.amountMinorSnapshot,
      wardLabel: wards.label,
    })
    .from(residentMonthlyCharges)
    .innerJoin(residents, eq(residents.id, residentMonthlyCharges.residentId))
    .leftJoin(
      residentPayments,
      eq(
        residentPayments.residentMonthlyChargeId,
        residentMonthlyCharges.id,
      ),
    )
    .leftJoin(wards, eq(wards.id, residentMonthlyCharges.wardIdSnapshot))
    .where(and(eq(residents.homeId, homeId), isNull(residentPayments.id)))
    .orderBy(asc(residents.fullName), asc(residentMonthlyCharges.billingMonth))
    .all();

  const byResident = new Map<string, HomeUnpaidMonthlyChargesWorklistEntry>();
  for (const r of rows) {
    let entry = byResident.get(r.residentId);
    if (!entry) {
      entry = {
        residentId: r.residentId,
        residentFullName: r.residentFullName,
        residentStatus: r.residentStatus,
        oldestUnpaidBillingMonth: r.billingMonth,
        totalUnpaidMinor: 0,
        unpaidCharges: [],
      };
      byResident.set(r.residentId, entry);
    }
    entry.unpaidCharges.push({
      id: r.chargeId,
      billingMonth: r.billingMonth,
      amountMinorSnapshot: r.amountMinorSnapshot,
      wardLabel: r.wardLabel ?? null,
    });
    entry.totalUnpaidMinor += r.amountMinorSnapshot;
    if (r.billingMonth.localeCompare(entry.oldestUnpaidBillingMonth) < 0) {
      entry.oldestUnpaidBillingMonth = r.billingMonth;
    }
  }

  const list = [...byResident.values()];
  list.sort((a, b) => {
    const cmp = a.oldestUnpaidBillingMonth.localeCompare(
      b.oldestUnpaidBillingMonth,
    );
    if (cmp !== 0) {
      return cmp;
    }
    return a.residentFullName.localeCompare(b.residentFullName);
  });

  for (const e of list) {
    e.unpaidCharges.sort((x, y) =>
      x.billingMonth.localeCompare(y.billingMonth),
    );
  }

  return list;
}

export function listResidentMonthlyCharges(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  filters?: { billingMonthFrom?: string; billingMonthTo?: string },
): ResidentMonthlyChargeListItem[] {
  requireBillingAdmin(actor);
  getResident(db, actor, homeId, residentId);

  const conds = [eq(residentMonthlyCharges.residentId, residentId)];
  if (filters?.billingMonthFrom) {
    conds.push(gte(residentMonthlyCharges.billingMonth, filters.billingMonthFrom));
  }
  if (filters?.billingMonthTo) {
    conds.push(lte(residentMonthlyCharges.billingMonth, filters.billingMonthTo));
  }

  const rows = db
    .select({
      charge: residentMonthlyCharges,
      payment: residentPayments,
      wardLabel: wards.label,
    })
    .from(residentMonthlyCharges)
    .leftJoin(
      residentPayments,
      eq(
        residentPayments.residentMonthlyChargeId,
        residentMonthlyCharges.id,
      ),
    )
    .leftJoin(wards, eq(wards.id, residentMonthlyCharges.wardIdSnapshot))
    .where(and(...conds))
    .orderBy(desc(residentMonthlyCharges.billingMonth))
    .all();

  return rows.map((r) => ({
    id: r.charge.id,
    billingMonth: r.charge.billingMonth,
    wardIdSnapshot: r.charge.wardIdSnapshot,
    wardLabel: r.wardLabel ?? null,
    amountMinorSnapshot: r.charge.amountMinorSnapshot,
    paid: r.payment != null,
    payment:
      r.payment == null
        ? null
        : {
            id: r.payment.id,
            amountMinor: r.payment.amountMinor,
            paidOn: r.payment.paidOn,
            notes: r.payment.notes,
            recordedByUserId: r.payment.recordedByUserId,
            createdAtUtcMs: r.payment.createdAtUtcMs,
            updatedAtUtcMs: r.payment.updatedAtUtcMs,
          },
  }));
}

/** Mirrors materialization rules in {@link payBillingMonthsForResident} for batch-pay UI totals. */
export type ResidentMonthlyChargesListMeta = {
  residentStatus: string;
  wardMonthlyRatePerPersonMinor: number | null;
};

export function getResidentMonthlyChargesListMeta(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): ResidentMonthlyChargesListMeta {
  requireBillingAdmin(actor);
  const resRow = getResident(db, actor, homeId, residentId);
  if (resRow.status === "departed") {
    return { residentStatus: "departed", wardMonthlyRatePerPersonMinor: null };
  }
  if (resRow.wardId == null) {
    return { residentStatus: resRow.status, wardMonthlyRatePerPersonMinor: null };
  }
  const ward = db
    .select()
    .from(wards)
    .where(and(eq(wards.id, resRow.wardId), eq(wards.homeId, homeId)))
    .get();
  if (!ward || ward.monthlyRatePerPersonMinor == null) {
    return { residentStatus: resRow.status, wardMonthlyRatePerPersonMinor: null };
  }
  return {
    residentStatus: resRow.status,
    wardMonthlyRatePerPersonMinor: ward.monthlyRatePerPersonMinor,
  };
}

export function createPaymentForCharge(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  chargeId: string,
  input: { amountMinor: number; paidOn: string; notes?: string | null },
): ResidentMonthlyChargeListItem {
  requireBillingAdmin(actor);
  getResident(db, actor, homeId, residentId);
  const charge = assertChargeInResidentHome(db, homeId, residentId, chargeId);

  const existing = db
    .select()
    .from(residentPayments)
    .where(eq(residentPayments.residentMonthlyChargeId, chargeId))
    .get();
  if (existing) {
    throw new ValidationError(
      "A payment already exists for this monthly charge.",
    );
  }

  if (
    !Number.isFinite(input.amountMinor) ||
    !Number.isInteger(input.amountMinor) ||
    input.amountMinor !== charge.amountMinorSnapshot
  ) {
    throw new ValidationError(
      "amountMinor must exactly match the charge snapshot.",
    );
  }

  const paidOn = parsePaidOn(input.paidOn);
  const notes =
    input.notes === undefined || input.notes === null
      ? null
      : input.notes.trim() || null;
  const now = Date.now();
  const id = randomUUID();

  db.insert(residentPayments)
    .values({
      id,
      residentMonthlyChargeId: chargeId,
      amountMinor: input.amountMinor,
      paidOn,
      notes,
      recordedByUserId: actor.userId,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();

  const listed = listResidentMonthlyCharges(db, actor, homeId, residentId);
  const row = listed.find((x) => x.id === chargeId);
  if (!row) {
    throw new NotFoundError();
  }
  return row;
}

export function createBatchPaymentsForCharges(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  input: { chargeIds: string[]; paidOn: string; notes?: string | null },
): ResidentMonthlyChargeListItem[] {
  requireBillingAdmin(actor);
  getResident(db, actor, homeId, residentId);

  if (input.chargeIds.length === 0) {
    throw new ValidationError("chargeIds must include at least one charge.");
  }

  const uniqueChargeIds = [...new Set(input.chargeIds)];
  const paidOn = parsePaidOn(input.paidOn);
  const notes =
    input.notes === undefined || input.notes === null
      ? null
      : input.notes.trim() || null;
  const now = Date.now();

  const snapshots: (typeof residentMonthlyCharges.$inferSelect)[] = [];

  db.transaction((tx) => {
    for (const chargeId of uniqueChargeIds) {
      const charge = tx
        .select()
        .from(residentMonthlyCharges)
        .where(eq(residentMonthlyCharges.id, chargeId))
        .get();
      if (!charge || charge.residentId !== residentId) {
        throw new NotFoundError();
      }
      const resRow = tx
        .select()
        .from(residents)
        .where(eq(residents.id, residentId))
        .get();
      if (!resRow || resRow.homeId !== homeId) {
        throw new NotFoundError();
      }
      const existing = tx
        .select()
        .from(residentPayments)
        .where(eq(residentPayments.residentMonthlyChargeId, chargeId))
        .get();
      if (existing) {
        throw new ValidationError(
          "One or more charges already have a payment.",
        );
      }
      snapshots.push(charge);
    }

    for (const charge of snapshots) {
      tx.insert(residentPayments)
        .values({
          id: randomUUID(),
          residentMonthlyChargeId: charge.id,
          amountMinor: charge.amountMinorSnapshot,
          paidOn,
          notes,
          recordedByUserId: actor.userId,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
    }
  });

  const listed = listResidentMonthlyCharges(db, actor, homeId, residentId);
  return snapshots.map((c) => {
    const row = listed.find((x) => x.id === c.id);
    if (!row) {
      throw new NotFoundError();
    }
    return row;
  });
}

/**
 * All-or-nothing: materialize missing monthly charge rows (active only) and record full
 * payment for each `YYYY-MM` in one transaction. See issue 19a.
 */
export function payBillingMonthsForResident(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  input: {
    billingMonths: string[];
    paidOn?: string;
    notes?: string | null;
  },
): ResidentMonthlyChargeListItem[] {
  requireBillingAdmin(actor);
  getResident(db, actor, homeId, residentId);

  if (input.billingMonths.length === 0) {
    throw new ValidationError("billingMonths must include at least one month.");
  }

  const monthSet = new Set<string>();
  for (const s of input.billingMonths) {
    const t = s.trim();
    if (t === "") {
      continue;
    }
    monthSet.add(parseBillingMonth(t));
  }
  if (monthSet.size === 0) {
    throw new ValidationError("billingMonths must include at least one month.");
  }
  const months = [...monthSet].sort((a, b) => a.localeCompare(b));
  if (months.length > MAX_BILLING_MONTHS_PER_BATCH) {
    throw new BillingBatchError(
      "At most 40 distinct billing months per request.",
      "TOO_MANY_MONTHS",
    );
  }

  const paidOn = resolveBatchPaidOn(input.paidOn);
  const notes =
    input.notes === undefined || input.notes === null
      ? null
      : input.notes.trim() || null;
  const now = Date.now();
  const chargeIdsToPay: string[] = [];

  db.transaction((tx) => {
    const resRow = tx
      .select()
      .from(residents)
      .where(eq(residents.id, residentId))
      .get();
    if (!resRow || resRow.homeId !== homeId) {
      throw new NotFoundError();
    }
    const admissionMonth = resRow.admissionDate.slice(0, 7);

    for (const month of months) {
      if (month.localeCompare(admissionMonth) < 0) {
        throw new BillingBatchError(
          "Cannot pay for a month before the resident was admitted.",
          "BEFORE_ADMISSION",
          month,
        );
      }

      if (resRow.status === "departed") {
        const ch = tx
          .select()
          .from(residentMonthlyCharges)
          .where(
            and(
              eq(residentMonthlyCharges.residentId, residentId),
              eq(residentMonthlyCharges.billingMonth, month),
            ),
          )
          .get();
        if (!ch) {
          throw new BillingBatchError(
            "No charge row for this month; departed residents cannot create new charge rows.",
            "NO_CHARGE_ROW",
            month,
          );
        }
        const p = tx
          .select()
          .from(residentPayments)
          .where(
            eq(residentPayments.residentMonthlyChargeId, ch.id),
          )
          .get();
        if (p) {
          throw new BillingBatchError("This month is already paid.", "ALREADY_PAID", month);
        }
        chargeIdsToPay.push(ch.id);
        continue;
      }

      const ch = tx
        .select()
        .from(residentMonthlyCharges)
        .where(
          and(
            eq(residentMonthlyCharges.residentId, residentId),
            eq(residentMonthlyCharges.billingMonth, month),
          ),
        )
        .get();
      if (ch) {
        const p = tx
          .select()
          .from(residentPayments)
          .where(eq(residentPayments.residentMonthlyChargeId, ch.id))
          .get();
        if (p) {
          throw new BillingBatchError("This month is already paid.", "ALREADY_PAID", month);
        }
        chargeIdsToPay.push(ch.id);
        continue;
      }

      if (resRow.wardId == null) {
        throw new BillingBatchError(
          "Resident has no ward, or the ward has no monthly rate, so a new charge row cannot be created.",
          "NO_WARD_RATE",
          month,
        );
      }
      const ward = tx
        .select()
        .from(wards)
        .where(
          and(eq(wards.id, resRow.wardId), eq(wards.homeId, homeId)),
        )
        .get();
      if (!ward || ward.monthlyRatePerPersonMinor == null) {
        throw new BillingBatchError(
          "Resident has no ward, or the ward has no monthly rate, so a new charge row cannot be created.",
          "NO_WARD_RATE",
          month,
        );
      }
      const newId = randomUUID();
      tx.insert(residentMonthlyCharges)
        .values({
          id: newId,
          residentId,
          billingMonth: month,
          wardIdSnapshot: resRow.wardId,
          amountMinorSnapshot: ward.monthlyRatePerPersonMinor,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
      chargeIdsToPay.push(newId);
    }

    for (const chargeId of chargeIdsToPay) {
      const c = tx
        .select()
        .from(residentMonthlyCharges)
        .where(eq(residentMonthlyCharges.id, chargeId))
        .get();
      if (!c) {
        throw new NotFoundError();
      }
      tx.insert(residentPayments)
        .values({
          id: randomUUID(),
          residentMonthlyChargeId: chargeId,
          amountMinor: c.amountMinorSnapshot,
          paidOn,
          notes,
          recordedByUserId: actor.userId,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
    }
  });

  const listed = listResidentMonthlyCharges(db, actor, homeId, residentId);
  return chargeIdsToPay.map((id) => {
    const row = listed.find((x) => x.id === id);
    if (!row) {
      throw new NotFoundError();
    }
    return row;
  });
}

export function updatePaymentForCharge(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  chargeId: string,
  input: { amountMinor?: number; paidOn?: string; notes?: string | null },
): ResidentMonthlyChargeListItem {
  requireBillingAdmin(actor);
  getResident(db, actor, homeId, residentId);
  const charge = assertChargeInResidentHome(db, homeId, residentId, chargeId);

  const existing = db
    .select()
    .from(residentPayments)
    .where(eq(residentPayments.residentMonthlyChargeId, chargeId))
    .get();
  if (!existing) {
    throw new NotFoundError();
  }

  if (input.amountMinor !== undefined) {
    if (
      !Number.isFinite(input.amountMinor) ||
      !Number.isInteger(input.amountMinor) ||
      input.amountMinor !== charge.amountMinorSnapshot
    ) {
      throw new ValidationError(
        "amountMinor must exactly match the charge snapshot.",
      );
    }
  }

  let paidOn = existing.paidOn;
  if (input.paidOn !== undefined) {
    paidOn = parsePaidOn(input.paidOn);
  }

  let notes = existing.notes;
  if (input.notes !== undefined) {
    notes =
      input.notes === null ? null : input.notes.trim() || null;
  }

  const amountMinor = charge.amountMinorSnapshot;
  const now = Date.now();

  db.update(residentPayments)
    .set({
      amountMinor,
      paidOn,
      notes,
      updatedAtUtcMs: now,
    })
    .where(eq(residentPayments.id, existing.id))
    .run();

  const listed = listResidentMonthlyCharges(db, actor, homeId, residentId);
  const row = listed.find((x) => x.id === chargeId);
  if (!row) {
    throw new NotFoundError();
  }
  return row;
}

export function deletePaymentForCharge(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  chargeId: string,
): ResidentMonthlyChargeListItem {
  requireBillingAdmin(actor);
  getResident(db, actor, homeId, residentId);
  assertChargeInResidentHome(db, homeId, residentId, chargeId);

  const existing = db
    .select()
    .from(residentPayments)
    .where(eq(residentPayments.residentMonthlyChargeId, chargeId))
    .get();
  if (!existing) {
    throw new NotFoundError();
  }

  db.delete(residentPayments)
    .where(eq(residentPayments.id, existing.id))
    .run();

  const listed = listResidentMonthlyCharges(db, actor, homeId, residentId);
  const row = listed.find((x) => x.id === chargeId);
  if (!row) {
    throw new NotFoundError();
  }
  return row;
}
