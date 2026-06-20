import { randomUUID } from "node:crypto";
import { and, desc, eq, like, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import {
  billingPayments,
  billingTransactions,
  salaryAccruals,
  salaryRemittances,
  staffSalaries,
  users,
} from "@/db/schema";
import {
  assertActorMayAccessHome,
  getCareUserAssignedHomeIds,
} from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { calendarDateIsoToUtcMs } from "@/lib/billing/receivedOnUtcMs";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import {
  isStaffEligibleForBillingMonth,
  recordSalaryRemittancePaymentInTx,
  type SalaryAccrual,
} from "./accruals";
import { isStaffRoleTitle } from "./roleTitles";

export type AppDb = BetterSQLite3Database<typeof schema>;

export type StaffSalary = {
  id: string;
  homeId: string;
  userId: string | null;
  fullName: string;
  roleTitle: string;
  monthlySalaryMinor: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  phone: string | null;
  notes: string | null;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};

export type StaffSalaryWithLastPaid = StaffSalary & {
  lastPaidMonth: string | null;
};

export type CreateStaffSalaryInput = {
  homeId: string;
  userId?: string | null;
  fullName: string;
  roleTitle: string;
  monthlySalaryMinor: number;
  effectiveFrom: string;
  phone?: string | null;
  notes?: string | null;
};

export type UpdateStaffSalaryInput = {
  fullName?: string;
  roleTitle?: string;
  monthlySalaryMinor?: number;
  effectiveFrom?: string;
  phone?: string | null;
  notes?: string | null;
  status?: "active" | "inactive";
  userId?: string | null;
};

export type CreateRemittanceInput = {
  staffSalaryId: string;
  homeId: string;
  periodYear: number;
  periodMonth: number;
  amountPaidMinor: number;
  paidOn: string;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
};

export type SalaryRemittance = {
  id: string;
  staffSalaryId: string;
  homeId: string;
  periodYear: number;
  periodMonth: number;
  amountPaidMinor: number;
  paidOn: string;
  paymentMethod: string | null;
  reference: string | null;
  markedByUserId: string;
  notes: string | null;
  paymentLedgerTransactionId: string;
  salaryAccrualId: string | null;
  createdAtUtcMs: number;
};

export const DEFAULT_SALARY_PAGE_SIZE = 20;
export const MAX_SALARY_PAGE_SIZE = 100;

function requireAdmin(actor: SessionActor): void {
  if (actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function assertActorMayViewStaffSalary(
  actor: SessionActor,
  salaryUserId: string | null,
): void {
  if (actor.role === "admin") {
    return;
  }
  if (actor.role === "care" && salaryUserId === actor.userId) {
    return;
  }
  throw new ForbiddenError();
}

function resolveLinkedUserId(
  db: AppDb,
  homeId: string,
  userId: string | null | undefined,
): string | null {
  if (userId == null || userId === "") {
    return null;
  }
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.role !== "care") {
    throw new ValidationError("Linked user must be a care staff member.");
  }
  const allowed = getCareUserAssignedHomeIds(db, userId);
  if (!allowed.has(homeId)) {
    throw new ValidationError("Linked user is not assigned to this home.");
  }
  return userId;
}

function validateSalaryInput(input: CreateStaffSalaryInput): void {
  if (!input.fullName.trim()) {
    throw new ValidationError("Full name is required.");
  }
  if (!input.roleTitle.trim()) {
    throw new ValidationError("Role title is required.");
  }
  if (!isStaffRoleTitle(input.roleTitle.trim())) {
    throw new ValidationError(
      "Role title must be Nurse, Care taker, or Kitchen Staff.",
    );
  }
  if (!input.effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    throw new ValidationError("Effective-from must be a valid YYYY-MM-DD date.");
  }
  if (input.monthlySalaryMinor <= 0) {
    throw new ValidationError("Monthly salary must be positive.");
  }
}

export function createStaffSalary(
  db: AppDb,
  actor: SessionActor,
  input: CreateStaffSalaryInput,
): StaffSalary {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);
  validateSalaryInput(input);

  const now = Date.now();
  const linkedUserId = resolveLinkedUserId(db, input.homeId, input.userId);

  const row = {
    id: randomUUID(),
    homeId: input.homeId,
    userId: linkedUserId,
    fullName: input.fullName.trim(),
    roleTitle: input.roleTitle.trim(),
    monthlySalaryMinor: input.monthlySalaryMinor,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
    status: "active",
    phone: input.phone ?? null,
    notes: input.notes ?? null,
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
  db.insert(staffSalaries).values(row).run();
  return row;
}

export function updateStaffSalary(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  salaryId: string,
  input: UpdateStaffSalaryInput,
): StaffSalary {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const existing = db
    .select()
    .from(staffSalaries)
    .where(and(eq(staffSalaries.id, salaryId), eq(staffSalaries.homeId, homeId)))
    .get();
  if (!existing) {
    throw new NotFoundError("Staff salary record not found.");
  }

  const updates: Record<string, unknown> = { updatedAtUtcMs: Date.now() };
  if (input.userId !== undefined) {
    updates.userId = resolveLinkedUserId(db, homeId, input.userId);
  }
  if (input.fullName !== undefined) {
    if (!input.fullName.trim()) throw new ValidationError("Full name is required.");
    updates.fullName = input.fullName.trim();
  }
  if (input.roleTitle !== undefined) {
    if (!input.roleTitle.trim()) throw new ValidationError("Role title is required.");
    if (!isStaffRoleTitle(input.roleTitle.trim())) {
      throw new ValidationError(
        "Role title must be Nurse, Care taker, or Kitchen Staff.",
      );
    }
    updates.roleTitle = input.roleTitle.trim();
  }
  if (input.monthlySalaryMinor !== undefined) {
    if (input.monthlySalaryMinor <= 0) throw new ValidationError("Monthly salary must be positive.");
    updates.monthlySalaryMinor = input.monthlySalaryMinor;
  }
  if (input.effectiveFrom !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
      throw new ValidationError("Effective-from must be a valid YYYY-MM-DD date.");
    }
    updates.effectiveFrom = input.effectiveFrom;
  }
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.status !== undefined) updates.status = input.status;

  db.update(staffSalaries).set(updates).where(eq(staffSalaries.id, salaryId)).run();

  return db.select().from(staffSalaries).where(eq(staffSalaries.id, salaryId)).get()!;
}

export function getStaffSalary(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  salaryId: string,
): StaffSalary {
  assertActorMayAccessHome(db, actor, homeId);

  const row = db
    .select()
    .from(staffSalaries)
    .where(and(eq(staffSalaries.id, salaryId), eq(staffSalaries.homeId, homeId)))
    .get();
  if (!row) {
    throw new NotFoundError("Staff salary record not found.");
  }
  assertActorMayViewStaffSalary(actor, row.userId);
  return row;
}

export type ListStaffSalariesOptions = {
  homeId: string;
  query?: string;
  status?: "active" | "inactive";
  page?: number;
  pageSize?: number;
};

export function listStaffSalariesPaged(
  db: AppDb,
  actor: SessionActor,
  opts: ListStaffSalariesOptions,
): { items: StaffSalaryWithLastPaid[]; totalCount: number } {
  assertActorMayAccessHome(db, actor, opts.homeId);

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(
    MAX_SALARY_PAGE_SIZE,
    Math.max(1, opts.pageSize ?? DEFAULT_SALARY_PAGE_SIZE),
  );
  const offset = (page - 1) * pageSize;

  const conditions = [eq(staffSalaries.homeId, opts.homeId)];
  if (actor.role !== "admin") {
    conditions.push(eq(staffSalaries.userId, actor.userId));
  }
  if (opts.status) {
    conditions.push(eq(staffSalaries.status, opts.status));
  }
  if (opts.query?.trim()) {
    conditions.push(like(staffSalaries.fullName, `%${opts.query.trim()}%`));
  }

  const where = and(...conditions);

  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(staffSalaries)
    .where(where)
    .get();
  const totalCount = countRow?.count ?? 0;

  const rows = db
    .select()
    .from(staffSalaries)
    .where(where)
    .orderBy(desc(staffSalaries.createdAtUtcMs))
    .limit(pageSize)
    .offset(offset)
    .all();

  const items: StaffSalaryWithLastPaid[] = rows.map((r) => {
    const lastRemittance = db
      .select()
      .from(salaryRemittances)
      .where(eq(salaryRemittances.staffSalaryId, r.id))
      .orderBy(desc(salaryRemittances.periodYear), desc(salaryRemittances.periodMonth))
      .limit(1)
      .get();
    const lastPaidMonth = lastRemittance
      ? `${lastRemittance.periodYear}-${String(lastRemittance.periodMonth).padStart(2, "0")}`
      : null;
    return { ...r, lastPaidMonth };
  });

  return { items, totalCount };
}

export function createRemittance(
  db: AppDb,
  actor: SessionActor,
  input: CreateRemittanceInput,
): SalaryRemittance {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);

  if (input.periodMonth < 1 || input.periodMonth > 12) {
    throw new ValidationError("Period month must be 1–12.");
  }
  if (input.periodYear < 2000 || input.periodYear > 2100) {
    throw new ValidationError("Period year is out of range.");
  }
  if (input.amountPaidMinor <= 0) {
    throw new ValidationError("Amount paid must be positive.");
  }
  if (!input.paidOn || !/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) {
    throw new ValidationError("Paid-on must be a valid YYYY-MM-DD date.");
  }

  const salary = db
    .select()
    .from(staffSalaries)
    .where(
      and(
        eq(staffSalaries.id, input.staffSalaryId),
        eq(staffSalaries.homeId, input.homeId),
      ),
    )
    .get();
  if (!salary) {
    throw new NotFoundError("Staff salary record not found.");
  }

  const existing = db
    .select()
    .from(salaryRemittances)
    .where(
      and(
        eq(salaryRemittances.staffSalaryId, input.staffSalaryId),
        eq(salaryRemittances.periodYear, input.periodYear),
        eq(salaryRemittances.periodMonth, input.periodMonth),
      ),
    )
    .get();
  if (existing) {
    throw new ValidationError(
      `Salary already marked as paid for ${input.periodYear}-${String(input.periodMonth).padStart(2, "0")}.`,
    );
  }

  const accrual = db
    .select()
    .from(salaryAccruals)
    .where(
      and(
        eq(salaryAccruals.staffSalaryId, input.staffSalaryId),
        eq(salaryAccruals.periodYear, input.periodYear),
        eq(salaryAccruals.periodMonth, input.periodMonth),
        eq(salaryAccruals.status, "accrued"),
      ),
    )
    .get();
  if (!accrual) {
    throw new ValidationError(
      "Generate salary accruals for this month before marking paid.",
    );
  }
  if (input.amountPaidMinor !== accrual.amountAccruedMinor) {
    throw new ValidationError(
      "Amount paid must equal the accrued salary amount (full payment only).",
    );
  }

  const remittanceId = randomUUID();
  const postedAtUtcMs = calendarDateIsoToUtcMs(input.paidOn);
  const receivedOnUtcMs = postedAtUtcMs;

  return db.transaction((tx) => {
    const { ledgerTransactionId: paymentLedgerTransactionId } =
      recordSalaryRemittancePaymentInTx(tx, actor, {
        homeId: input.homeId,
        amountMinor: input.amountPaidMinor,
        receivedOnUtcMs,
        method: input.paymentMethod?.trim() || "cash",
        chargeLedgerTransactionId: accrual.chargeLedgerTransactionId,
        externalReference: input.reference,
        notes: input.notes,
        postedAtUtcMs,
      });

    const row: SalaryRemittance = {
      id: remittanceId,
      staffSalaryId: input.staffSalaryId,
      homeId: input.homeId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      amountPaidMinor: input.amountPaidMinor,
      paidOn: input.paidOn,
      paymentMethod: input.paymentMethod ?? null,
      reference: input.reference ?? null,
      markedByUserId: actor.userId,
      notes: input.notes ?? null,
      paymentLedgerTransactionId,
      salaryAccrualId: accrual.id,
      createdAtUtcMs: Date.now(),
    };
    tx.insert(salaryRemittances).values(row).run();

    tx.update(salaryAccruals)
      .set({ status: "paid", updatedAtUtcMs: Date.now() })
      .where(eq(salaryAccruals.id, accrual.id))
      .run();

    return row;
  });
}

export function deleteRemittance(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  remittanceId: string,
): void {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const row = db
    .select()
    .from(salaryRemittances)
    .where(
      and(
        eq(salaryRemittances.id, remittanceId),
        eq(salaryRemittances.homeId, homeId),
      ),
    )
    .get();
  if (!row) {
    throw new NotFoundError("Remittance record not found.");
  }

  db.transaction((tx) => {
    const payment = tx
      .select({ id: billingPayments.id })
      .from(billingPayments)
      .where(eq(billingPayments.ledgerTransactionId, row.paymentLedgerTransactionId))
      .get();

    if (payment) {
      tx.delete(billingPayments).where(eq(billingPayments.id, payment.id)).run();
    }

    tx.delete(salaryRemittances)
      .where(eq(salaryRemittances.id, remittanceId))
      .run();
    tx.delete(billingTransactions)
      .where(eq(billingTransactions.id, row.paymentLedgerTransactionId))
      .run();

    if (row.salaryAccrualId) {
      tx.update(salaryAccruals)
        .set({ status: "accrued", updatedAtUtcMs: Date.now() })
        .where(eq(salaryAccruals.id, row.salaryAccrualId))
        .run();
    }
  });
}

export type ListRemittancesOptions = {
  homeId: string;
  periodYear: number;
  periodMonth: number;
};

export type RemittanceWithStaffName = SalaryRemittance & {
  staffFullName: string;
  staffRoleTitle: string;
  staffMonthlySalaryMinor: number;
};

export type StaffWithRemittanceAndAccrual = StaffSalary & {
  remittance: SalaryRemittance | null;
  accrual: SalaryAccrual | null;
};

export function listRemittancesForMonth(
  db: AppDb,
  actor: SessionActor,
  opts: ListRemittancesOptions,
): { staff: StaffWithRemittanceAndAccrual[]; hasAccrualBatch: boolean } {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, opts.homeId);

  const billingMonth = `${opts.periodYear}-${String(opts.periodMonth).padStart(2, "0")}`;

  const activeStaff = db
    .select()
    .from(staffSalaries)
    .where(and(eq(staffSalaries.homeId, opts.homeId), eq(staffSalaries.status, "active")))
    .orderBy(staffSalaries.fullName)
    .all()
    .filter((s) => isStaffEligibleForBillingMonth(s, billingMonth));

  let hasAccrualBatch = false;

  const result = activeStaff.map((s) => {
    const accrual =
      db
        .select()
        .from(salaryAccruals)
        .where(
          and(
            eq(salaryAccruals.staffSalaryId, s.id),
            eq(salaryAccruals.periodYear, opts.periodYear),
            eq(salaryAccruals.periodMonth, opts.periodMonth),
          ),
        )
        .get() ?? null;

    if (accrual) {
      hasAccrualBatch = true;
    }

    const remittance =
      db
        .select()
        .from(salaryRemittances)
        .where(
          and(
            eq(salaryRemittances.staffSalaryId, s.id),
            eq(salaryRemittances.periodYear, opts.periodYear),
            eq(salaryRemittances.periodMonth, opts.periodMonth),
          ),
        )
        .get() ?? null;
    return { ...s, remittance, accrual };
  });

  return { staff: result, hasAccrualBatch };
}

export function listRemittancesForStaffSalary(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  salaryId: string,
): SalaryRemittance[] {
  const salary = getStaffSalary(db, actor, homeId, salaryId);
  return db
    .select()
    .from(salaryRemittances)
    .where(eq(salaryRemittances.staffSalaryId, salary.id))
    .orderBy(
      desc(salaryRemittances.periodYear),
      desc(salaryRemittances.periodMonth),
    )
    .all();
}
