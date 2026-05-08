import { getDb } from "@/db/client";
import { homes } from "@/db/schema";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import {
  DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
  clampHomeExpensePageSize,
  listHomeExpensesLedger,
  parsePaymentStatus,
  resolveHomeExpenseIncurredRange,
  type HomeExpensesLedgerPaymentFilter,
  type HomeExpenseLedgerRow,
  type HomeExpensesLedgerSummary,
} from "@/lib/homeExpenses/service";
import { listExpenseTypes } from "@/lib/expenseTypes/service";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeExpensesSection } from "./HomeExpensesSection";

type PageProps = {
  searchParams?: Promise<{
    homeId?: string;
    incurredFrom?: string;
    incurredTo?: string;
    paymentStatus?: string;
    expenseTypeId?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return fallback;
  }
  return n;
}

const emptySummary: HomeExpensesLedgerSummary = {
  grandTotalMinor: 0,
  breakdown: [],
};

export default async function HomeExpensesPage({ searchParams }: PageProps) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect("/dashboard");
  }
  const actor = requireSessionActor(session);
  const db = getDb();
  const homeOptions = listDashboardHomeOptions(db);
  const q = searchParams ? await searchParams : {};

  let selectedHomeId = typeof q.homeId === "string" ? q.homeId : "";
  if (
    selectedHomeId &&
    !homeOptions.some((h) => h.homeId === selectedHomeId)
  ) {
    selectedHomeId = "";
  }
  if (!selectedHomeId) {
    selectedHomeId = homeOptions[0]?.homeId ?? "";
  }
  const homeRow = selectedHomeId
    ? db.select().from(homes).where(eq(homes.id, selectedHomeId)).get()
    : undefined;

  const atMs = Date.now();
  let rangeHadError = false;
  let range;
  try {
    range = resolveHomeExpenseIncurredRange(
      typeof q.incurredFrom === "string" ? q.incurredFrom : undefined,
      typeof q.incurredTo === "string" ? q.incurredTo : undefined,
      atMs,
    );
  } catch {
    rangeHadError = true;
    range = resolveHomeExpenseIncurredRange(undefined, undefined, atMs);
  }

  const { paymentStatus: paymentParsed, hadInvalid: badPay } =
    parsePaymentStatus(
      typeof q.paymentStatus === "string" ? q.paymentStatus : undefined,
    );

  const paymentStatus: HomeExpensesLedgerPaymentFilter = badPay
    ? "all"
    : paymentParsed;
  const expenseTypeId =
    typeof q.expenseTypeId === "string" && q.expenseTypeId.trim()
      ? q.expenseTypeId.trim()
      : "";

  const page = parsePositiveInt(typeof q.page === "string" ? q.page : undefined, 1);
  const pageSize = clampHomeExpensePageSize(
    parsePositiveInt(
      typeof q.pageSize === "string" ? q.pageSize : undefined,
      DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
    ),
  );

  const ledger: {
    rows: HomeExpenseLedgerRow[];
    totalCount: number;
    page: number;
    pageSize: number;
    summary: HomeExpensesLedgerSummary;
  } =
    selectedHomeId && homeRow
      ? listHomeExpensesLedger(db, actor, selectedHomeId, {
          incurredFrom: range.incurredFrom,
          incurredTo: range.incurredTo,
          paymentStatus,
          expenseTypeId: expenseTypeId || null,
          page,
          pageSize,
        })
      : {
          rows: [],
          totalCount: 0,
          page,
          pageSize,
          summary: emptySummary,
        };

  const expenseTypes = listExpenseTypes(db, actor);

  return (
    <main className="flex flex-col gap-7 text-[var(--text-primary)]">
      {(rangeHadError || badPay) && (
        <p className="rounded-xl border border-terracotta/25 bg-cream px-4 py-3 text-sm text-ink">
          Invalid filter in the URL was reset:&nbsp;
          {rangeHadError
            ? "use both incurredFrom and incurredTo for a custom date range."
            : null}
          {rangeHadError && badPay ? " " : null}
          {badPay ? 'paymentStatus must be "all", "paid", or "unpaid".' : null}
        </p>
      )}

      <HomeExpensesSection
        homes={homeOptions}
        selectedHomeId={selectedHomeId}
        defaultCurrencyCode={homeRow?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE}
        expenseTypes={expenseTypes}
        ledger={ledger}
        incurredFrom={range.incurredFrom}
        incurredTo={range.incurredTo}
        rangeIsDefaultYtd={range.isDefaultYtd}
        paymentStatus={paymentStatus}
        expenseTypeId={expenseTypeId}
      />
    </main>
  );
}
