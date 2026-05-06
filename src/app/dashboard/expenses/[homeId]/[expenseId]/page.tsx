import { buildDashboardExpensesPath } from "@/lib/billing/dashboardExpensesPath";
import { getDb } from "@/db/client";
import { homes } from "@/db/schema";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { listExpenseTypes } from "@/lib/expenseTypes/service";
import {
  clampHomeExpensePageSize,
  DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
  getHomeExpenseLedgerRow,
  parsePaymentStatus,
  resolveHomeExpenseIncurredRange,
  type HomeExpensesLedgerPaymentFilter,
} from "@/lib/homeExpenses/service";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { HomeExpenseDetailClient } from "./HomeExpenseDetailClient";

type PageProps = {
  params: Promise<{ homeId: string; expenseId: string }>;
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

export default async function HomeExpenseDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { homeId, expenseId } = await params;
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
  if (!homeOptions.some((h) => h.homeId === homeId)) {
    notFound();
  }

  const homeRow = db.select().from(homes).where(eq(homes.id, homeId)).get();
  const homeName =
    homeOptions.find((h) => h.homeId === homeId)?.homeName ?? "Home";
  const currencyCode = homeRow?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE;

  const q = searchParams ? await searchParams : {};
  const atMs = Date.now();
  let range;
  try {
    range = resolveHomeExpenseIncurredRange(
      typeof q.incurredFrom === "string" ? q.incurredFrom : undefined,
      typeof q.incurredTo === "string" ? q.incurredTo : undefined,
      atMs,
    );
  } catch {
    range = resolveHomeExpenseIncurredRange(undefined, undefined, atMs);
  }

  const { paymentStatus: paymentParsed, hadInvalid: badPay } =
    parsePaymentStatus(
      typeof q.paymentStatus === "string" ? q.paymentStatus : undefined,
    );
  const paymentStatus: HomeExpensesLedgerPaymentFilter = badPay
    ? "all"
    : paymentParsed;
  const expenseTypeIdFilter =
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

  const backHref = buildDashboardExpensesPath(homeId, {
    incurredFrom: range.isDefaultYtd ? undefined : range.incurredFrom,
    incurredTo: range.isDefaultYtd ? undefined : range.incurredTo,
    paymentStatus,
    expenseTypeId: expenseTypeIdFilter || undefined,
    page,
    pageSize,
  });

  let expense;
  try {
    expense = getHomeExpenseLedgerRow(db, actor, homeId, expenseId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  const expenseTypes = listExpenseTypes(db, actor);

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <header className="village-reveal relative isolate overflow-hidden rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] px-5 py-6 shadow-[0_24px_64px_-38px_color-mix(in_srgb,var(--accent)_36%,transparent)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -left-16 top-1/2 h-52 w-52 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--highlight)_18%,transparent),transparent_70%)]" />
        <p className="relative font-mono text-[0.66rem] uppercase tracking-[0.26em] text-[var(--accent-strong)]">
          Expense detail
        </p>
        <h1 className="relative mt-2 village-page-title text-3xl sm:text-4xl">
          Ledger entry
        </h1>
        <p className="relative mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          Full operating-cost record for this home. Use the ledger to compare
          across dates; this page keeps context while you review receipts and
          notes.
        </p>
      </header>

      <HomeExpenseDetailClient
        expense={expense}
        homeId={homeId}
        homeName={homeName}
        currencyCode={currencyCode}
        expenseTypes={expenseTypes}
        backHref={backHref}
      />
    </main>
  );
}
