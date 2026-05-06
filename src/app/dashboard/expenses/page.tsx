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
      <div className="village-reveal relative isolate rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] px-5 py-6 shadow-[0_22px_60px_-36px_color-mix(in_srgb,var(--accent)_42%,transparent)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-1/2 rounded-r-3xl bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_24%,transparent),transparent_46%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--highlight)_20%,transparent),transparent_42%)]" />
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--accent-strong)]">
            Admin ledger
          </p>
          <h1 className="village-page-title text-4xl">Home expenses</h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Operating costs paid by the village (utilities, catering, supplies)
            in each home&apos;s currency. Amounts exclude resident charges.
          </p>
        </div>
      </div>

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
