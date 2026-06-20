import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingPayments,
  billingTransactions,
  homes,
  salaryAccruals,
  salaryRemittances,
  staffSalaries,
} from "@/db/schema";
import { parseBillingMonth } from "@/lib/billing/billingMonth";
import { ensureHomeAccount, postHomeTransactionInTx } from "@/lib/billing/homeAccounts";
import { calendarDateIsoToUtcMs } from "@/lib/billing/receivedOnUtcMs";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import type { AppDb } from "./service";
import type { SalaryRemittance } from "./service";
import {
  formatSalaryPaymentChargeMemo,
  formatSalaryRemittanceMemo,
  SALARY_ACCRUAL_SOURCE_KIND,
} from "./ledger";

export type SalaryAccrual = {
  id: string;
  staffSalaryId: string;
  homeId: string;
  periodYear: number;
  periodMonth: number;
  amountAccruedMinor: number;
  chargeLedgerTransactionId: string;
  accruedOn: string;
  status: string;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};

export type SalaryAccrualSkipReason = "duplicate";

export type SalaryAccrualSkip = {
  staffSalaryId: string;
  reason: SalaryAccrualSkipReason;
};

export type GenerateMonthlySalaryAccrualsResult = {
  created: number;
  skipped: SalaryAccrualSkip[];
};

export type HomeSalaryAccrualsResult = {
  homeId: string;
  created: number;
  skipped: SalaryAccrualSkip[];
};

export type GenerateAllHomesSalaryAccrualsResult = {
  billingMonth: string;
  homes: HomeSalaryAccrualsResult[];
};

export type SalaryAccrualWithStaff = SalaryAccrual & {
  staffFullName: string;
  staffRoleTitle: string;
  staffMonthlySalaryMinor: number;
  remittance: SalaryRemittance | null;
};

function requireAdmin(actor: SessionActor): void {
  if (actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function billingMonthParts(billingMonth: string): {
  periodYear: number;
  periodMonth: number;
} {
  const normalized = parseBillingMonth(billingMonth);
  const [yStr, mStr] = normalized.split("-");
  return { periodYear: Number(yStr), periodMonth: Number(mStr) };
}

function firstDayOfBillingMonth(billingMonth: string): string {
  return `${parseBillingMonth(billingMonth)}-01`;
}

function lastDayOfBillingMonth(billingMonth: string): string {
  const normalized = parseBillingMonth(billingMonth);
  const [yStr, mStr] = normalized.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${normalized}-${String(lastDay).padStart(2, "0")}`;
}

export function isStaffEligibleForBillingMonth(
  staff: Pick<
    typeof staffSalaries.$inferSelect,
    "status" | "effectiveFrom" | "effectiveTo"
  >,
  billingMonth: string,
): boolean {
  if (staff.status !== "active") {
    return false;
  }
  const firstDay = firstDayOfBillingMonth(billingMonth);
  const lastDay = lastDayOfBillingMonth(billingMonth);
  if (staff.effectiveFrom > lastDay) {
    return false;
  }
  if (staff.effectiveTo != null && staff.effectiveTo < firstDay) {
    return false;
  }
  return true;
}

/**
 * Idempotent monthly salary accruals for one home and billing month.
 * Posts one charge ledger row per eligible active staff member.
 */
export function generateMonthlySalaryAccruals(
  db: AppDb,
  actor: SessionActor,
  input: { homeId: string; billingMonth: string },
): GenerateMonthlySalaryAccrualsResult {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);

  const { periodYear, periodMonth } = billingMonthParts(input.billingMonth);
  const accruedOn = lastDayOfBillingMonth(input.billingMonth);
  const postedAtUtcMs = calendarDateIsoToUtcMs(accruedOn);

  const staffRows = db
    .select()
    .from(staffSalaries)
    .where(eq(staffSalaries.homeId, input.homeId))
    .all()
    .filter((s) => isStaffEligibleForBillingMonth(s, input.billingMonth));

  const skipped: SalaryAccrualSkip[] = [];
  let created = 0;

  for (const staff of staffRows) {
    const existing = db
      .select({ id: salaryAccruals.id })
      .from(salaryAccruals)
      .where(
        and(
          eq(salaryAccruals.staffSalaryId, staff.id),
          eq(salaryAccruals.periodYear, periodYear),
          eq(salaryAccruals.periodMonth, periodMonth),
        ),
      )
      .get();

    if (existing) {
      skipped.push({ staffSalaryId: staff.id, reason: "duplicate" });
      continue;
    }

    const now = Date.now();
    const accrualId = randomUUID();

    db.transaction((tx) => {
      const { ledgerTransactionId: chargeLedgerTransactionId } = postHomeTransactionInTx(
        tx,
        actor,
        {
          homeId: input.homeId,
          txnType: "charge",
          amountMinor: staff.monthlySalaryMinor,
          sourceKind: SALARY_ACCRUAL_SOURCE_KIND,
          sourceId: accrualId,
          memo: formatSalaryRemittanceMemo(staff.fullName, periodYear, periodMonth),
          postedAtUtcMs,
        },
      );

      tx.insert(salaryAccruals)
        .values({
          id: accrualId,
          staffSalaryId: staff.id,
          homeId: input.homeId,
          periodYear,
          periodMonth,
          amountAccruedMinor: staff.monthlySalaryMinor,
          chargeLedgerTransactionId,
          accruedOn,
          status: "accrued",
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
    });

    created += 1;
  }

  return { created, skipped };
}

/**
 * Idempotent monthly salary accruals for every non-archived home.
 * Used by the internal cron and manual catch-up invocations.
 */
export function generateMonthlySalaryAccrualsForAllHomes(
  db: AppDb,
  actor: SessionActor,
  input: { billingMonth: string },
): GenerateAllHomesSalaryAccrualsResult {
  requireAdmin(actor);
  const billingMonth = parseBillingMonth(input.billingMonth);

  const homeRows = db
    .select({ id: homes.id })
    .from(homes)
    .where(isNull(homes.archivedAtUtcMs))
    .all();

  const results: HomeSalaryAccrualsResult[] = homeRows.map((home) => {
    const result = generateMonthlySalaryAccruals(db, actor, {
      homeId: home.id,
      billingMonth,
    });
    return { homeId: home.id, ...result };
  });

  return { billingMonth, homes: results };
}

export function listSalaryAccrualsForMonth(
  db: AppDb,
  actor: SessionActor,
  input: { homeId: string; periodYear: number; periodMonth: number },
): { accruals: SalaryAccrualWithStaff[]; hasAccrualBatch: boolean } {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);

  const rows = db
    .select({
      accrual: salaryAccruals,
      staffFullName: staffSalaries.fullName,
      staffRoleTitle: staffSalaries.roleTitle,
      staffMonthlySalaryMinor: staffSalaries.monthlySalaryMinor,
    })
    .from(salaryAccruals)
    .innerJoin(staffSalaries, eq(staffSalaries.id, salaryAccruals.staffSalaryId))
    .where(
      and(
        eq(salaryAccruals.homeId, input.homeId),
        eq(salaryAccruals.periodYear, input.periodYear),
        eq(salaryAccruals.periodMonth, input.periodMonth),
      ),
    )
    .all();

  const accruals: SalaryAccrualWithStaff[] = rows.map((r) => {
    const remittance =
      db
        .select()
        .from(salaryRemittances)
        .where(eq(salaryRemittances.salaryAccrualId, r.accrual.id))
        .get() ?? null;
    return {
      ...r.accrual,
      staffFullName: r.staffFullName,
      staffRoleTitle: r.staffRoleTitle,
      staffMonthlySalaryMinor: r.staffMonthlySalaryMinor,
      remittance,
    };
  });

  return { accruals, hasAccrualBatch: accruals.length > 0 };
}

export function voidSalaryAccrual(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  accrualId: string,
): void {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const accrual = db
    .select()
    .from(salaryAccruals)
    .where(and(eq(salaryAccruals.id, accrualId), eq(salaryAccruals.homeId, homeId)))
    .get();
  if (!accrual) {
    throw new NotFoundError("Salary accrual not found.");
  }
  if (accrual.status !== "accrued") {
    throw new ValidationError("Only accrued salary accruals can be voided.");
  }

  const remittance = db
    .select({ id: salaryRemittances.id })
    .from(salaryRemittances)
    .where(eq(salaryRemittances.salaryAccrualId, accrualId))
    .get();
  if (remittance) {
    throw new ValidationError("Cannot void an accrual that has a remittance.");
  }

  db.transaction((tx) => {
    tx.delete(salaryAccruals).where(eq(salaryAccruals.id, accrualId)).run();
    tx.delete(billingTransactions)
      .where(eq(billingTransactions.id, accrual.chargeLedgerTransactionId))
      .run();
  });
}

export function recordSalaryRemittancePaymentInTx(
  tx: AppDb,
  actor: SessionActor,
  input: {
    homeId: string;
    amountMinor: number;
    receivedOnUtcMs: number;
    method: string;
    chargeLedgerTransactionId: string;
    externalReference?: string | null;
    notes?: string | null;
    postedAtUtcMs: number;
  },
): { paymentId: string; ledgerTransactionId: string } {
  const account = ensureHomeAccount(tx, input.homeId);
  const now = Date.now();
  const paymentId = randomUUID();
  const ledgerTransactionId = randomUUID();
  const memo = formatSalaryPaymentChargeMemo(input.chargeLedgerTransactionId);

  tx.insert(billingTransactions)
    .values({
      id: ledgerTransactionId,
      accountId: account.id,
      accountType: "home",
      txnType: "payment",
      amountMinor: -input.amountMinor,
      sourceKind: "payment",
      sourceId: paymentId,
      memo,
      recordedByUserId: actor.userId,
      postedAtUtcMs: input.postedAtUtcMs,
    })
    .run();

  tx.insert(billingPayments)
    .values({
      id: paymentId,
      accountId: account.id,
      amountMinor: input.amountMinor,
      receivedOn: input.receivedOnUtcMs,
      method: input.method.trim(),
      externalReference: input.externalReference?.trim() || null,
      notes: input.notes?.trim() || null,
      recordedByUserId: actor.userId,
      ledgerTransactionId,
      updatedAtUtcMs: now,
    })
    .run();

  return { paymentId, ledgerTransactionId };
}
