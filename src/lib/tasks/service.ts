import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { assertActorMayAccessHome, getCareUserAssignedHomeIds } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingTransactions,
  homes,
  invoiceLineItems,
  invoices,
  residentAccounts,
  residents,
  tasks,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

export type TaskPriority = "normal" | "urgent";
export type TaskStatus = "open" | "completed";
export type Task = typeof tasks.$inferSelect & {
  priority: TaskPriority;
  status: TaskStatus;
};
export type TaskListItem = Task & { homeName: string };

export type ManualInboxItem = TaskListItem & { kind: "manual" };
export type PaymentOverdueInboxItem = {
  kind: "payment_overdue";
  /** Stable id: charge ledger transaction id. */
  sourceId: string;
  homeId: string;
  homeName: string;
  currencyCode: string;
  residentId: string;
  residentName: string;
  billingMonth: string;
  amountMinor: number;
};
export type ResidentBirthdayInboxItem = {
  kind: "resident_birthday";
  /** Stable id for the resident's birthday occurrence in the as-of year. */
  sourceId: string;
  homeId: string;
  homeName: string;
  residentId: string;
  residentName: string;
  /** ISO date-only birthday occurrence for the current reminder year. */
  birthdayDate: string;
};
export type InboxItem =
  | ManualInboxItem
  | PaymentOverdueInboxItem
  | ResidentBirthdayInboxItem;
export type CompletedManualItem = TaskListItem & { kind: "manual" };

export type CreateTaskInput = {
  homeId: string;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  priority?: string;
};

export type UpdateTaskInput = {
  homeId?: string;
  title?: string;
  notes?: string | null;
  dueDate?: string | null;
  priority?: string;
  status?: string;
};

function requireTaskAccess(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): asserts actor is SessionActor {
  if (!actor) {
    throw new ForbiddenError();
  }
  assertActorMayAccessHome(db, actor, homeId);
}

function normalizeTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title) {
    throw new ValidationError("title is required.");
  }
  return title;
}

function normalizeOptionalText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const t = raw.trim();
  return t || null;
}

function parsePriority(raw: string | undefined): TaskPriority {
  if (raw === undefined || raw === "") {
    return "normal";
  }
  if (raw === "normal" || raw === "urgent") {
    return raw;
  }
  throw new ValidationError("priority must be normal or urgent.");
}

function parseStatus(raw: string | undefined): TaskStatus {
  if (raw === undefined || raw === "") {
    return "open";
  }
  if (raw === "open" || raw === "completed") {
    return raw;
  }
  throw new ValidationError("status must be open or completed.");
}

function parseIsoDateOnly(raw: string | null | undefined, label: string): string | null {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return null;
  }
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError(`${label} must be an ISO date (YYYY-MM-DD).`);
  }
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError(`${label} is not a valid calendar date.`);
  }
  return s;
}

function assertHomeExists(db: AppDb, homeId: string): void {
  const row = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!row) {
    throw new NotFoundError();
  }
}

function taskFromRow(row: typeof tasks.$inferSelect): Task {
  return {
    ...row,
    priority: parsePriority(row.priority),
    status: parseStatus(row.status),
  };
}

function getTaskForActor(
  db: AppDb,
  actor: SessionActor | undefined,
  taskId: string,
): Task {
  const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!row) {
    throw new NotFoundError();
  }
  requireTaskAccess(db, actor, row.homeId);
  return taskFromRow(row);
}

export function createTask(
  db: AppDb,
  actor: SessionActor | undefined,
  input: CreateTaskInput,
): Task {
  requireTaskAccess(db, actor, input.homeId);
  assertHomeExists(db, input.homeId);
  const now = Date.now();
  const row: typeof tasks.$inferInsert = {
    id: randomUUID(),
    homeId: input.homeId,
    title: normalizeTitle(input.title),
    notes: normalizeOptionalText(input.notes),
    dueDate: parseIsoDateOnly(input.dueDate, "dueDate"),
    priority: parsePriority(input.priority),
    status: "open",
    createdByUserId: actor.userId,
    completedAtUtcMs: null,
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
  db.insert(tasks).values(row).run();
  return taskFromRow(row as typeof tasks.$inferSelect);
}

function loadOpenManualTaskRows(
  db: AppDb,
  actor: SessionActor,
): TaskListItem[] {
  const baseWhere = eq(tasks.status, "open");
  const rows =
    actor.role === "admin"
      ? db
          .select({ task: tasks, homeName: homes.name })
          .from(tasks)
          .innerJoin(homes, eq(tasks.homeId, homes.id))
          .where(baseWhere)
          .orderBy(asc(tasks.createdAtUtcMs), asc(tasks.id))
          .all()
      : (() => {
          const allowed = getCareUserAssignedHomeIds(db, actor.userId);
          if (allowed.size === 0) {
            return [];
          }
          return db
            .select({ task: tasks, homeName: homes.name })
            .from(tasks)
            .innerJoin(homes, eq(tasks.homeId, homes.id))
            .where(and(baseWhere, inArray(tasks.homeId, [...allowed])))
            .orderBy(asc(tasks.createdAtUtcMs), asc(tasks.id))
            .all();
        })();
  return rows.map((row) => ({ ...taskFromRow(row.task), homeName: row.homeName }));
}

/**
 * Returns combined open manual tasks and computed payment overdue rows
 * (unpaid monthly charges after the billing month has ended; not Dismissible in v1).
 */
export function firstDayAfterBillingMonth(billingMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
    throw new ValidationError("billing month must be YYYY-MM.");
  }
  const [yStr, mStr] = billingMonth.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (m < 1 || m > 12) {
    throw new ValidationError("billing month is not a valid calendar month.");
  }
  if (m === 12) {
    return `${y + 1}-01-01`;
  }
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function listPaymentOverdueReminders(
  db: AppDb,
  actor: SessionActor,
  asOfDateUtc: string,
): PaymentOverdueInboxItem[] {
  const overdue = sql`date(${invoices.billingPeriod} || '-01', '+1 month') <= date(${asOfDateUtc})`;
  const noLaterPayment = sql`not exists (
    select 1
    from billing_transactions p
    where p.account_id = ${billingTransactions.accountId}
      and p.txn_type = 'payment'
      and p.posted_at_utc_ms >= ${billingTransactions.postedAtUtcMs}
  )`;
  if (actor.role === "admin") {
    const rows = db
      .select({
        sourceId: billingTransactions.id,
        homeId: residents.homeId,
        homeName: homes.name,
        currencyCode: homes.defaultCurrencyCode,
        residentId: residents.id,
        residentName: residents.fullName,
        billingMonth: invoices.billingPeriod,
        amountMinor: billingTransactions.amountMinor,
      })
      .from(billingTransactions)
      .innerJoin(residentAccounts, eq(residentAccounts.id, billingTransactions.accountId))
      .innerJoin(residents, eq(residents.id, residentAccounts.residentId))
      .innerJoin(homes, eq(homes.id, residents.homeId))
      .leftJoin(
        invoiceLineItems,
        or(
          and(
            eq(billingTransactions.sourceKind, "invoice_line_item"),
            eq(billingTransactions.sourceId, invoiceLineItems.id),
          ),
          and(
            eq(billingTransactions.sourceKind, "invoice_monthly_fee"),
            eq(invoiceLineItems.category, "monthly_fee"),
            sql`(${billingTransactions.accountId} || ':' || ${invoiceLineItems.serviceMonth}) = ${billingTransactions.sourceId}`,
          ),
        ),
      )
      .innerJoin(
        invoices,
        or(
          and(
            eq(billingTransactions.sourceKind, "invoice"),
            eq(billingTransactions.sourceId, invoices.id),
          ),
          and(
            eq(billingTransactions.sourceKind, "invoice_line_item"),
            eq(invoiceLineItems.invoiceId, invoices.id),
          ),
          and(
            eq(billingTransactions.sourceKind, "invoice_monthly_fee"),
            eq(invoiceLineItems.invoiceId, invoices.id),
          ),
        ),
      )
      .where(
        and(
          eq(billingTransactions.txnType, "charge"),
          isNotNull(invoices.billingPeriod),
          overdue,
          noLaterPayment,
        ),
      )
      .all();
    return rows.flatMap((row) =>
      row.billingMonth === null
        ? []
        : [
            {
              kind: "payment_overdue" as const,
              sourceId: row.sourceId,
              homeId: row.homeId,
              homeName: row.homeName,
              currencyCode: row.currencyCode,
              residentId: row.residentId,
              residentName: row.residentName,
              billingMonth: row.billingMonth,
              amountMinor: row.amountMinor,
            },
          ],
    );
  }
  const allowed = getCareUserAssignedHomeIds(db, actor.userId);
  if (allowed.size === 0) {
    return [];
  }
  const rows = db
    .select({
      sourceId: billingTransactions.id,
      homeId: residents.homeId,
      homeName: homes.name,
      currencyCode: homes.defaultCurrencyCode,
      residentId: residents.id,
      residentName: residents.fullName,
      billingMonth: invoices.billingPeriod,
      amountMinor: billingTransactions.amountMinor,
    })
    .from(billingTransactions)
    .innerJoin(residentAccounts, eq(residentAccounts.id, billingTransactions.accountId))
    .innerJoin(residents, eq(residents.id, residentAccounts.residentId))
    .innerJoin(homes, eq(homes.id, residents.homeId))
    .leftJoin(
      invoiceLineItems,
      or(
        and(
          eq(billingTransactions.sourceKind, "invoice_line_item"),
          eq(billingTransactions.sourceId, invoiceLineItems.id),
        ),
        and(
          eq(billingTransactions.sourceKind, "invoice_monthly_fee"),
          eq(invoiceLineItems.category, "monthly_fee"),
          sql`(${billingTransactions.accountId} || ':' || ${invoiceLineItems.serviceMonth}) = ${billingTransactions.sourceId}`,
        ),
      ),
    )
    .innerJoin(
      invoices,
      or(
        and(
          eq(billingTransactions.sourceKind, "invoice"),
          eq(billingTransactions.sourceId, invoices.id),
        ),
        and(
          eq(billingTransactions.sourceKind, "invoice_line_item"),
          eq(invoiceLineItems.invoiceId, invoices.id),
        ),
        and(
          eq(billingTransactions.sourceKind, "invoice_monthly_fee"),
          eq(invoiceLineItems.invoiceId, invoices.id),
        ),
      ),
    )
    .where(
      and(
        eq(billingTransactions.txnType, "charge"),
        isNotNull(invoices.billingPeriod),
        overdue,
        noLaterPayment,
        inArray(residents.homeId, [...allowed]),
      ),
    )
    .all();
  return rows.flatMap((row) =>
    row.billingMonth === null
      ? []
      : [
          {
            kind: "payment_overdue" as const,
            sourceId: row.sourceId,
            homeId: row.homeId,
            homeName: row.homeName,
            currencyCode: row.currencyCode,
            residentId: row.residentId,
            residentName: row.residentName,
            billingMonth: row.billingMonth,
            amountMinor: row.amountMinor,
          },
        ],
  );
}

function isoDateFromUtcParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addUtcDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return isoDateFromUtcParts(
    dt.getUTCFullYear(),
    dt.getUTCMonth() + 1,
    dt.getUTCDate(),
  );
}

function birthdayOccurrenceForWindow(dob: string, asOfDateUtc: string): string {
  const asOfYear = Number(asOfDateUtc.slice(0, 4));
  const [, birthMonth, birthDay] = dob.split("-").map(Number);
  const thisYearBirthday = isoDateFromUtcParts(asOfYear, birthMonth, birthDay);
  if (thisYearBirthday >= asOfDateUtc) {
    return thisYearBirthday;
  }
  return isoDateFromUtcParts(asOfYear + 1, birthMonth, birthDay);
}

function listResidentBirthdayReminders(
  db: AppDb,
  actor: SessionActor,
  asOfDateUtc: string,
): ResidentBirthdayInboxItem[] {
  const active = eq(residents.status, "active");
  const rows =
    actor.role === "admin"
      ? db
          .select({
            residentId: residents.id,
            residentName: residents.fullName,
            dob: residents.dob,
            homeId: residents.homeId,
            homeName: homes.name,
          })
          .from(residents)
          .innerJoin(homes, eq(homes.id, residents.homeId))
          .where(active)
          .all()
      : (() => {
          const allowed = getCareUserAssignedHomeIds(db, actor.userId);
          if (allowed.size === 0) {
            return [];
          }
          return db
            .select({
              residentId: residents.id,
              residentName: residents.fullName,
              dob: residents.dob,
              homeId: residents.homeId,
              homeName: homes.name,
            })
            .from(residents)
            .innerJoin(homes, eq(homes.id, residents.homeId))
            .where(and(active, inArray(residents.homeId, [...allowed])))
            .all();
        })();
  const windowEnd = addUtcDays(asOfDateUtc, 7);
  return rows
    .map((row) => ({
      ...row,
      birthdayDate: birthdayOccurrenceForWindow(row.dob, asOfDateUtc),
    }))
    .filter((row) => row.birthdayDate <= windowEnd)
    .map((row) => ({
      kind: "resident_birthday" as const,
      sourceId: `resident-birthday:${row.residentId}:${row.birthdayDate.slice(0, 4)}`,
      homeId: row.homeId,
      homeName: row.homeName,
      residentId: row.residentId,
      residentName: row.residentName,
      birthdayDate: row.birthdayDate,
    }));
}

function manualUrgentFirstRank(priority: TaskPriority): number {
  return priority === "urgent" ? 0 : 1;
}

/** Deterministic work-queue order for the open inbox (25d). */
function compareOpenInboxItems(a: InboxItem, b: InboxItem, asOf: string): number {
  const bucketA = openInboxBucket(a, asOf);
  const bucketB = openInboxBucket(b, asOf);
  if (bucketA !== bucketB) {
    return bucketA - bucketB;
  }
  if (a.kind === "manual" && b.kind === "manual") {
    return compareOpenManualInBucket(a, b, asOf, bucketA);
  }
  if (a.kind === "payment_overdue" && b.kind === "payment_overdue") {
    const byMonth = a.billingMonth.localeCompare(b.billingMonth);
    if (byMonth !== 0) {
      return byMonth;
    }
    return a.sourceId.localeCompare(b.sourceId);
  }
  if (a.kind === "resident_birthday" && b.kind === "resident_birthday") {
    const byDate = a.birthdayDate.localeCompare(b.birthdayDate);
    if (byDate !== 0) {
      return byDate;
    }
    return a.sourceId.localeCompare(b.sourceId);
  }
  return stableKindTie(a, b);
}

function openInboxBucket(item: InboxItem, asOf: string): number {
  if (item.kind === "payment_overdue") {
    return 1;
  }
  if (item.kind === "resident_birthday") {
    if (item.birthdayDate === asOf) {
      return 3;
    }
    return 5;
  }
  if (item.kind === "manual") {
    const due = item.dueDate;
    if (due !== null) {
      if (due < asOf) {
        return 0;
      }
      if (due === asOf) {
        return 2;
      }
      return 4;
    }
    return 6;
  }
  return 99;
}

function compareOpenManualInBucket(
  a: ManualInboxItem,
  b: ManualInboxItem,
  asOf: string,
  bucket: number,
): number {
  const pa = manualUrgentFirstRank(a.priority);
  const pb = manualUrgentFirstRank(b.priority);
  if (bucket === 0) {
    if (a.dueDate! < b.dueDate!) {
      return -1;
    }
    if (a.dueDate! > b.dueDate!) {
      return 1;
    }
    if (pa !== pb) {
      return pa - pb;
    }
    return a.id.localeCompare(b.id);
  }
  if (bucket === 2) {
    if (pa !== pb) {
      return pa - pb;
    }
    return a.id.localeCompare(b.id);
  }
  if (bucket === 4) {
    if (a.dueDate! < b.dueDate!) {
      return -1;
    }
    if (a.dueDate! > b.dueDate!) {
      return 1;
    }
    if (pa !== pb) {
      return pa - pb;
    }
    return a.id.localeCompare(b.id);
  }
  if (bucket === 6) {
    if (pa !== pb) {
      return pa - pb;
    }
    if (a.createdAtUtcMs !== b.createdAtUtcMs) {
      return b.createdAtUtcMs - a.createdAtUtcMs;
    }
    return a.id.localeCompare(b.id);
  }
  return a.id.localeCompare(b.id);
}

function stableKindTie(a: InboxItem, b: InboxItem): number {
  return a.kind.localeCompare(b.kind);
}

function sortOpenInboxItems(items: InboxItem[], asOf: string): InboxItem[] {
  return [...items].sort((a, b) => compareOpenInboxItems(a, b, asOf));
}

export type TaskInboxListStatus = "open" | "completed";
export type TaskInboxTypeFilter = "all" | "manual" | "payment_overdue" | "birthday";

export type TaskInboxListQuery = {
  status: TaskInboxListStatus;
  homeId: string | null;
  inboxType: TaskInboxTypeFilter;
};

export function parseTaskInboxQuery(url: URL): TaskInboxListQuery {
  const sp = url.searchParams;
  const statusRaw = sp.get("status");
  const typeRaw = sp.get("type");
  const homeRaw = sp.get("home");

  if (
    statusRaw !== null &&
    statusRaw !== "" &&
    statusRaw !== "open" &&
    statusRaw !== "completed"
  ) {
    throw new ValidationError("status must be open or completed.");
  }
  const status: TaskInboxListStatus =
    statusRaw === "completed" ? "completed" : "open";

  if (
    typeRaw !== null &&
    typeRaw !== "" &&
    typeRaw !== "all" &&
    typeRaw !== "manual" &&
    typeRaw !== "payment_overdue" &&
    typeRaw !== "birthday"
  ) {
    throw new ValidationError(
      "type must be all, manual, payment_overdue, or birthday.",
    );
  }
  const inboxType: TaskInboxTypeFilter =
    typeRaw === "manual"
      ? "manual"
      : typeRaw === "payment_overdue"
        ? "payment_overdue"
        : typeRaw === "birthday"
          ? "birthday"
          : "all";

  const homeId =
    homeRaw === null || homeRaw === "" || homeRaw === "all"
      ? null
      : homeRaw.trim();
  if (homeId && !/^[0-9a-f-]{36}$/i.test(homeId)) {
    throw new ValidationError("home must be a home id, all, or empty.");
  }

  return { status, homeId, inboxType };
}

function filterInboxByHomeAndType(
  items: InboxItem[],
  homeId: string | null,
  inboxType: TaskInboxTypeFilter,
): InboxItem[] {
  let out = items;
  if (homeId) {
    out = out.filter((i) => i.homeId === homeId);
  }
  if (inboxType === "all") {
    return out;
  }
  if (inboxType === "manual") {
    return out.filter((i) => i.kind === "manual");
  }
  if (inboxType === "payment_overdue") {
    return out.filter((i) => i.kind === "payment_overdue");
  }
  return out.filter((i) => i.kind === "resident_birthday");
}

function filterCompletedByHomeAndType(
  items: CompletedManualItem[],
  homeId: string | null,
  inboxType: TaskInboxTypeFilter,
): CompletedManualItem[] {
  if (inboxType !== "all" && inboxType !== "manual") {
    return [];
  }
  if (!homeId) {
    return items;
  }
  return items.filter((i) => i.homeId === homeId);
}

function validateHomeFilterForActor(
  db: AppDb,
  actor: SessionActor,
  homeId: string | null,
): void {
  if (!homeId) {
    return;
  }
  assertHomeExists(db, homeId);
  assertActorMayAccessHome(db, actor, homeId);
}

export function listTasksForInboxQuery(
  db: AppDb,
  actor: SessionActor | undefined,
  query: TaskInboxListQuery,
  options?: { asOfDateUtc?: string },
): InboxItem[] | CompletedManualItem[] {
  if (!actor) {
    throw new ForbiddenError();
  }
  validateHomeFilterForActor(db, actor, query.homeId);
  const asOfDateUtc =
    options?.asOfDateUtc ?? new Date().toISOString().slice(0, 10);
  if (query.status === "completed") {
    const completed = listCompletedManualTasks(db, actor);
    return filterCompletedByHomeAndType(
      completed,
      query.homeId,
      query.inboxType,
    );
  }
  const raw = listOpenInboxUnsorted(db, actor, asOfDateUtc);
  const filtered = filterInboxByHomeAndType(
    raw,
    query.homeId,
    query.inboxType,
  );
  return sortOpenInboxItems(filtered, asOfDateUtc);
}

function listOpenInboxUnsorted(
  db: AppDb,
  actor: SessionActor,
  asOfDateUtc: string,
): InboxItem[] {
  const manual: ManualInboxItem[] = loadOpenManualTaskRows(db, actor).map((t) => ({
    ...t,
    kind: "manual" as const,
  }));
  const payment = listPaymentOverdueReminders(db, actor, asOfDateUtc);
  const birthday = listResidentBirthdayReminders(db, actor, asOfDateUtc);
  return [...manual, ...payment, ...birthday];
}

/**
 * Open manual tasks with a due date on or before `asOfDateUtc` (excludes
 * no-due-date and completed). Same home scope as the tasks inbox.
 */
function countOpenManualTasksDueOnOrBefore(
  db: AppDb,
  actor: SessionActor,
  asOfDateUtc: string,
): number {
  const openDue = and(
    eq(tasks.status, "open"),
    isNotNull(tasks.dueDate),
    lte(tasks.dueDate, asOfDateUtc),
  );
  if (actor.role === "admin") {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(tasks)
      .where(openDue)
      .get();
    return Number(row?.n ?? 0);
  }
  const allowed = getCareUserAssignedHomeIds(db, actor.userId);
  if (allowed.size === 0) {
    return 0;
  }
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(and(openDue, inArray(tasks.homeId, [...allowed])))
    .get();
  return Number(row?.n ?? 0);
}

export type TasksDashboardSummary = {
  overduePayments: number;
  /** Open manual tasks with due date set and due on or before as-of. */
  manualDueOrOverdue: number;
  /** Active residents with a birthday on as-of or within the next 7 UTC days. */
  birthdaysInNext7Days: number;
};

/**
 * At-a-glance counts for the dashboard card (25e). Rules match the open
 * tasks inbox: payment overdue query, manual due filter, birthday window.
 */
export function getTasksDashboardSummary(
  db: AppDb,
  actor: SessionActor | undefined,
  options?: { asOfDateUtc?: string },
): TasksDashboardSummary {
  if (!actor) {
    throw new ForbiddenError();
  }
  const asOfDateUtc =
    options?.asOfDateUtc ?? new Date().toISOString().slice(0, 10);
  return {
    overduePayments: listPaymentOverdueReminders(db, actor, asOfDateUtc).length,
    manualDueOrOverdue: countOpenManualTasksDueOnOrBefore(
      db,
      actor,
      asOfDateUtc,
    ),
    birthdaysInNext7Days: listResidentBirthdayReminders(
      db,
      actor,
      asOfDateUtc,
    ).length,
  };
}

export function parseTaskInboxQueryFromServerSearchParams(q: {
  status?: string | string[];
  type?: string | string[];
  home?: string | string[];
}): TaskInboxListQuery {
  const pick = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const url = new URL("http://local/");
  const s = pick(q.status);
  const t = pick(q.type);
  const h = pick(q.home);
  if (s) {
    url.searchParams.set("status", s);
  }
  if (t) {
    url.searchParams.set("type", t);
  }
  if (h) {
    url.searchParams.set("home", h);
  }
  return parseTaskInboxQuery(url);
}

export function listOpenInbox(
  db: AppDb,
  actor: SessionActor | undefined,
  options?: { asOfDateUtc?: string },
): InboxItem[] {
  if (!actor) {
    throw new ForbiddenError();
  }
  const asOfDateUtc =
    options?.asOfDateUtc ?? new Date().toISOString().slice(0, 10);
  return sortOpenInboxItems(
    listOpenInboxUnsorted(db, actor, asOfDateUtc),
    asOfDateUtc,
  );
}

export function listCompletedManualTasks(
  db: AppDb,
  actor: SessionActor | undefined,
): CompletedManualItem[] {
  if (!actor) {
    throw new ForbiddenError();
  }
  const baseWhere = eq(tasks.status, "completed");
  const rows =
    actor.role === "admin"
      ? db
          .select({ task: tasks, homeName: homes.name })
          .from(tasks)
          .innerJoin(homes, eq(tasks.homeId, homes.id))
          .where(baseWhere)
          .orderBy(desc(tasks.updatedAtUtcMs), asc(tasks.id))
          .all()
      : (() => {
          const allowed = getCareUserAssignedHomeIds(db, actor.userId);
          if (allowed.size === 0) {
            return [];
          }
          return db
            .select({ task: tasks, homeName: homes.name })
            .from(tasks)
            .innerJoin(homes, eq(tasks.homeId, homes.id))
            .where(and(baseWhere, inArray(tasks.homeId, [...allowed])))
            .orderBy(desc(tasks.updatedAtUtcMs), asc(tasks.id))
            .all();
        })();
  return rows.map((row) => ({
    ...taskFromRow(row.task),
    homeName: row.homeName,
    kind: "manual" as const,
  }));
}

export function updateTask(
  db: AppDb,
  actor: SessionActor | undefined,
  taskId: string,
  input: UpdateTaskInput,
): Task {
  const existing = getTaskForActor(db, actor, taskId);
  const nextHomeId = input.homeId ?? existing.homeId;
  if (nextHomeId !== existing.homeId) {
    requireTaskAccess(db, actor, nextHomeId);
    assertHomeExists(db, nextHomeId);
  }

  const status = input.status !== undefined ? parseStatus(input.status) : existing.status;
  const now = Date.now();
  const completedAtUtcMs =
    status === "completed"
      ? existing.completedAtUtcMs ?? now
      : null;
  db.update(tasks)
    .set({
      homeId: nextHomeId,
      title:
        input.title !== undefined ? normalizeTitle(input.title) : existing.title,
      notes:
        input.notes !== undefined
          ? normalizeOptionalText(input.notes)
          : existing.notes,
      dueDate:
        input.dueDate !== undefined
          ? parseIsoDateOnly(input.dueDate, "dueDate")
          : existing.dueDate,
      priority:
        input.priority !== undefined
          ? parsePriority(input.priority)
          : existing.priority,
      status,
      completedAtUtcMs,
      updatedAtUtcMs: now,
    })
    .where(eq(tasks.id, taskId))
    .run();

  return getTaskForActor(db, actor, taskId);
}

export function completeTask(
  db: AppDb,
  actor: SessionActor | undefined,
  taskId: string,
): Task {
  return updateTask(db, actor, taskId, { status: "completed" });
}

export function deleteTask(
  db: AppDb,
  actor: SessionActor | undefined,
  taskId: string,
): void {
  const existing = getTaskForActor(db, actor, taskId);
  db.delete(tasks).where(eq(tasks.id, existing.id)).run();
}
