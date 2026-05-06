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
  sql,
} from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { expenseTypes, homeExpenses, homes } from "@/db/schema";
import {
  resolveExpenseAttachmentsDir,
  unlinkHomeExpenseAttachmentFilesForExpense,
} from "@/lib/homeExpenseAttachments/service";
import type { AppDb } from "@/lib/homes/service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import { MAX_CHARGES_LEDGER_PAGE_SIZE } from "@/lib/billing/residentCharges";
import {
  DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
  type HomeExpenseLedgerRow,
  type HomeExpenseTypeTotal,
  type HomeExpensesLedgerPaymentFilter,
  type HomeExpensesLedgerSummary,
} from "@/lib/homeExpenses/ledgerShared";

export { MAX_CHARGES_LEDGER_PAGE_SIZE };

export type {
  HomeExpenseLedgerRow,
  HomeExpenseTypeTotal,
  HomeExpensesLedgerPaymentFilter,
  HomeExpensesLedgerSummary,
} from "@/lib/homeExpenses/ledgerShared";

export { DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE } from "@/lib/homeExpenses/ledgerShared";

function requireHomeExpensesAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

/**
 * Parses a date-only field. Stored and compared as ISO `YYYY-MM-DD` calendar
 * strings **without timezone conversion**.
 */
export function parseIsoDateOnly(raw: string, fieldLabel: string): string {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError(
      `${fieldLabel} must be an ISO date (YYYY-MM-DD).`,
    );
  }
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError(`${fieldLabel} is not a valid calendar date.`);
  }
  return s;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today’s calendar date in **UTC** (same basis as `defaultPaidOnUtcDate` in billing). */
export function utcTodayIsoDate(nowUtcMs: number): string {
  const d = new Date(nowUtcMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(day)}`;
}

export function utcYearStartIsoDate(nowUtcMs: number): string {
  const y = new Date(nowUtcMs).getUTCFullYear();
  return `${String(y).padStart(4, "0")}-01-01`;
}

/**
 * Default list range: **calendar year-to-date in UTC** on `incurred_on`.
 * Custom range requires **both** `incurredFrom` and `incurredTo` (inclusive).
 */
export function resolveHomeExpenseIncurredRange(
  rawFrom: string | undefined,
  rawTo: string | undefined,
  nowUtcMs: number,
): { incurredFrom: string; incurredTo: string; isDefaultYtd: boolean } {
  const a = rawFrom?.trim() ?? "";
  const b = rawTo?.trim() ?? "";
  if (a === "" && b === "") {
    return {
      incurredFrom: utcYearStartIsoDate(nowUtcMs),
      incurredTo: utcTodayIsoDate(nowUtcMs),
      isDefaultYtd: true,
    };
  }
  if (a === "" || b === "") {
    throw new ValidationError(
      "incurredFrom and incurredTo must both be set for a custom range.",
    );
  }
  const incurredFrom = parseIsoDateOnly(a, "incurredFrom");
  const incurredTo = parseIsoDateOnly(b, "incurredTo");
  if (incurredFrom > incurredTo) {
    throw new ValidationError(
      "incurredFrom must be on or before incurredTo.",
    );
  }
  return { incurredFrom, incurredTo, isDefaultYtd: false };
}

function assertPaidAfterIncurred(incurredOn: string, paidOn: string | null) {
  if (!paidOn) return;
  if (paidOn < incurredOn) {
    throw new ValidationError("paid_on must be on or after incurred_on.");
  }
}

export function parsePaymentStatus(raw: string | undefined | null): {
  paymentStatus: HomeExpensesLedgerPaymentFilter;
  hadInvalid: boolean;
} {
  if (!raw?.trim()) {
    return { paymentStatus: "all", hadInvalid: false };
  }
  const s = raw.trim();
  if (s === "all" || s === "unpaid" || s === "paid") {
    return { paymentStatus: s, hadInvalid: false };
  }
  return { paymentStatus: "all", hadInvalid: true };
}

export function clampHomeExpensePageSize(rawPageSize: number): number {
  const fallback = DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE;
  const n = Math.floor(rawPageSize) || fallback;
  return Math.min(MAX_CHARGES_LEDGER_PAGE_SIZE, Math.max(1, n));
}

function paymentCond(filter: HomeExpensesLedgerPaymentFilter) {
  if (filter === "paid") return isNotNull(homeExpenses.paidOn);
  if (filter === "unpaid") return isNull(homeExpenses.paidOn);
  return undefined;
}

function buildLedgerWhere(
  homeId: string,
  incurredFrom: string,
  incurredTo: string,
  paymentStatus: HomeExpensesLedgerPaymentFilter,
  expenseTypeId: string | null,
) {
  const typeCond = expenseTypeId
    ? eq(homeExpenses.expenseTypeId, expenseTypeId)
    : undefined;
  const p = paymentCond(paymentStatus);
  const conds = [
    eq(homeExpenses.homeId, homeId),
    gte(homeExpenses.incurredOn, incurredFrom),
    lte(homeExpenses.incurredOn, incurredTo),
    p,
    typeCond,
  ].filter((c): c is NonNullable<typeof c> => c != null);
  return and(...conds);
}

export function listHomeExpensesLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: {
    incurredFrom: string;
    incurredTo: string;
    paymentStatus: HomeExpensesLedgerPaymentFilter;
    expenseTypeId: string | null;
    page: number;
    pageSize: number;
  },
): {
  rows: HomeExpenseLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeExpensesLedgerSummary;
} {
  requireHomeExpensesAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }

  const page = Math.max(1, Math.floor(input.page) || 1);
  const pageSize = clampHomeExpensePageSize(input.pageSize);
  const offset = (page - 1) * pageSize;

  const whereLedger = buildLedgerWhere(
    homeId,
    input.incurredFrom,
    input.incurredTo,
    input.paymentStatus,
    input.expenseTypeId,
  );

  const metaRow = db
    .select({
      totalCount: count(),
      grandTotalMinor: sql<number>`ifnull(sum(${homeExpenses.amountMinor}), 0)`,
    })
    .from(homeExpenses)
    .where(whereLedger)
    .get();

  const totalCount = Number(metaRow?.totalCount ?? 0);
  const grandTotalMinor = Number(metaRow?.grandTotalMinor ?? 0);

  const breakdownRows = db
    .select({
      expenseTypeId: expenseTypes.id,
      name: expenseTypes.name,
      totalMinor: sql<number>`ifnull(sum(${homeExpenses.amountMinor}), 0)`,
    })
    .from(homeExpenses)
    .innerJoin(expenseTypes, eq(expenseTypes.id, homeExpenses.expenseTypeId))
    .where(whereLedger)
    .groupBy(expenseTypes.id)
    .orderBy(asc(expenseTypes.name), asc(expenseTypes.id))
    .all();

  const breakdown: HomeExpenseTypeTotal[] = breakdownRows.map((r) => ({
    expenseTypeId: r.expenseTypeId,
    name: r.name,
    totalMinor: Number(r.totalMinor ?? 0),
  }));

  const dataRows = db
    .select({
      expense: homeExpenses,
      typeName: expenseTypes.name,
    })
    .from(homeExpenses)
    .innerJoin(expenseTypes, eq(expenseTypes.id, homeExpenses.expenseTypeId))
    .where(whereLedger)
    .orderBy(desc(homeExpenses.incurredOn), desc(homeExpenses.id))
    .limit(pageSize)
    .offset(offset)
    .all();

  const rows: HomeExpenseLedgerRow[] = dataRows.map((r) => ({
    id: r.expense.id,
    expenseTypeId: r.expense.expenseTypeId,
    expenseTypeName: r.typeName,
    amountMinor: r.expense.amountMinor,
    incurredOn: r.expense.incurredOn,
    paidOn: r.expense.paidOn ?? null,
    vendor: r.expense.vendor ?? null,
    invoiceReference: r.expense.invoiceReference ?? null,
    note: r.expense.note ?? null,
    createdAtUtcMs: r.expense.createdAtUtcMs,
    updatedAtUtcMs: r.expense.updatedAtUtcMs,
  }));

  return {
    rows,
    totalCount,
    page,
    pageSize,
    summary: { grandTotalMinor, breakdown },
  };
}

function assertExpenseTypeExists(db: AppDb, typeId: string): void {
  const t = db
    .select({ id: expenseTypes.id })
    .from(expenseTypes)
    .where(eq(expenseTypes.id, typeId))
    .get();
  if (!t) {
    throw new ValidationError("expense type not found.");
  }
}

export type HomeExpenseDto = {
  id: string;
  homeId: string;
  expenseTypeId: string;
  amountMinor: number;
  incurredOn: string;
  paidOn: string | null;
  vendor: string | null;
  invoiceReference: string | null;
  note: string | null;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};

export function createHomeExpense(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: {
    expenseTypeId: string;
    amountMinor: number;
    incurredOn: string;
    paidOn?: string | null;
    vendor?: string | null;
    invoiceReference?: string | null;
    note?: string | null;
  },
  nowUtcMs: number,
): HomeExpenseDto {
  requireHomeExpensesAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }

  const amountMinor = Math.floor(Number(input.amountMinor));
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new ValidationError("amount_minor must be a positive integer.");
  }

  const incurredOn = parseIsoDateOnly(input.incurredOn, "incurred_on");
  let paidOn: string | null = null;
  if (input.paidOn != null && String(input.paidOn).trim() !== "") {
    paidOn = parseIsoDateOnly(String(input.paidOn), "paid_on");
  }
  assertPaidAfterIncurred(incurredOn, paidOn);

  const expenseTypeId = input.expenseTypeId.trim();
  if (!expenseTypeId) {
    throw new ValidationError("expense_type_id is required.");
  }
  assertExpenseTypeExists(db, expenseTypeId);

  const id = randomUUID();
  const vendor = normalizeOptionalText(input.vendor);
  const invoiceReference = normalizeOptionalText(input.invoiceReference);
  const note = normalizeOptionalText(input.note);

  db.insert(homeExpenses)
    .values({
      id,
      homeId,
      expenseTypeId,
      amountMinor,
      incurredOn,
      paidOn,
      vendor,
      invoiceReference,
      note,
      createdAtUtcMs: nowUtcMs,
      updatedAtUtcMs: nowUtcMs,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
    })
    .run();

  const row = db.select().from(homeExpenses).where(eq(homeExpenses.id, id)).get();
  if (!row) {
    throw new Error("home expense insert did not persist.");
  }
  return mapRowToDto(row);
}

function normalizeOptionalText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mapRowToDto(row: typeof homeExpenses.$inferSelect): HomeExpenseDto {
  return {
    id: row.id,
    homeId: row.homeId,
    expenseTypeId: row.expenseTypeId,
    amountMinor: row.amountMinor,
    incurredOn: row.incurredOn,
    paidOn: row.paidOn ?? null,
    vendor: row.vendor ?? null,
    invoiceReference: row.invoiceReference ?? null,
    note: row.note ?? null,
    createdAtUtcMs: row.createdAtUtcMs,
    updatedAtUtcMs: row.updatedAtUtcMs,
  };
}

function getHomeExpenseInHome(
  db: AppDb,
  homeId: string,
  expenseId: string,
): typeof homeExpenses.$inferSelect {
  const row = db
    .select()
    .from(homeExpenses)
    .where(
      and(eq(homeExpenses.id, expenseId), eq(homeExpenses.homeId, homeId)),
    )
    .get();
  if (!row) {
    throw new NotFoundError();
  }
  return row;
}

/** One ledger row for admin detail views and GET `/api/homes/.../expenses/:id`. */
export function getHomeExpenseLedgerRow(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  expenseId: string,
): HomeExpenseLedgerRow {
  requireHomeExpensesAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
  const dataRow = db
    .select({
      expense: homeExpenses,
      typeName: expenseTypes.name,
    })
    .from(homeExpenses)
    .innerJoin(expenseTypes, eq(expenseTypes.id, homeExpenses.expenseTypeId))
    .where(
      and(eq(homeExpenses.id, expenseId), eq(homeExpenses.homeId, homeId)),
    )
    .get();
  if (!dataRow) {
    throw new NotFoundError();
  }
  return {
    id: dataRow.expense.id,
    expenseTypeId: dataRow.expense.expenseTypeId,
    expenseTypeName: dataRow.typeName,
    amountMinor: dataRow.expense.amountMinor,
    incurredOn: dataRow.expense.incurredOn,
    paidOn: dataRow.expense.paidOn ?? null,
    vendor: dataRow.expense.vendor ?? null,
    invoiceReference: dataRow.expense.invoiceReference ?? null,
    note: dataRow.expense.note ?? null,
    createdAtUtcMs: dataRow.expense.createdAtUtcMs,
    updatedAtUtcMs: dataRow.expense.updatedAtUtcMs,
  };
}

export function updateHomeExpense(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  expenseId: string,
  input: {
    expenseTypeId?: string;
    amountMinor?: number;
    incurredOn?: string;
    paidOn?: string | null;
    vendor?: string | null;
    invoiceReference?: string | null;
    note?: string | null;
  },
  nowUtcMs: number,
): HomeExpenseDto {
  requireHomeExpensesAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
  const existing = getHomeExpenseInHome(db, homeId, expenseId);

  const expenseTypeId =
    input.expenseTypeId !== undefined
      ? input.expenseTypeId.trim()
      : existing.expenseTypeId;
  if (!expenseTypeId) {
    throw new ValidationError("expense_type_id is required.");
  }
  if (input.expenseTypeId !== undefined) {
    assertExpenseTypeExists(db, expenseTypeId);
  }

  const amountMinor =
    input.amountMinor !== undefined
      ? Math.floor(Number(input.amountMinor))
      : existing.amountMinor;
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new ValidationError("amount_minor must be a positive integer.");
  }

  const incurredOn =
    input.incurredOn !== undefined
      ? parseIsoDateOnly(input.incurredOn, "incurred_on")
      : existing.incurredOn;

  let paidOn: string | null = existing.paidOn ?? null;
  if (input.paidOn !== undefined) {
    if (input.paidOn == null || String(input.paidOn).trim() === "") {
      paidOn = null;
    } else {
      paidOn = parseIsoDateOnly(String(input.paidOn), "paid_on");
    }
  }
  assertPaidAfterIncurred(incurredOn, paidOn);

  const vendor =
    input.vendor !== undefined ? normalizeOptionalText(input.vendor) : existing.vendor;
  const invoiceReference =
    input.invoiceReference !== undefined
      ? normalizeOptionalText(input.invoiceReference)
      : existing.invoiceReference;
  const note =
    input.note !== undefined ? normalizeOptionalText(input.note) : existing.note;

  db.update(homeExpenses)
    .set({
      expenseTypeId,
      amountMinor,
      incurredOn,
      paidOn,
      vendor,
      invoiceReference,
      note,
      updatedAtUtcMs: nowUtcMs,
      updatedByUserId: actor.userId,
    })
    .where(eq(homeExpenses.id, expenseId))
    .run();

  const row = getHomeExpenseInHome(db, homeId, expenseId);
  return mapRowToDto(row);
}

export function deleteHomeExpense(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  expenseId: string,
): void {
  requireHomeExpensesAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
  getHomeExpenseInHome(db, homeId, expenseId);
  unlinkHomeExpenseAttachmentFilesForExpense(
    db,
    expenseId,
    resolveExpenseAttachmentsDir(),
  );
  db.delete(homeExpenses).where(eq(homeExpenses.id, expenseId)).run();
}
