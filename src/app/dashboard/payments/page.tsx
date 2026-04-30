import { getDb } from "@/db/client";
import { homes } from "@/db/schema";
import type { HomeMonthlyPaymentLedgerRow } from "@/lib/billing/residentCharges";
import {
  DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE,
  listHomeMonthlyPaymentsLedger,
  MAX_PAYMENTS_LEDGER_PAGE_SIZE,
} from "@/lib/billing/residentCharges";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomePaymentsLedgerSection } from "./HomePaymentsLedgerSection";

type PaymentsPageProps = {
  searchParams?: Promise<{
    homeId?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function parsePageParam(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return 1;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return 1;
  }
  return n;
}

function parsePageSizeParam(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE;
  }
  return Math.min(MAX_PAYMENTS_LEDGER_PAGE_SIZE, n);
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
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
  const page = parsePageParam(
    typeof q.page === "string" ? q.page : undefined,
  );
  const pageSize = parsePageSizeParam(
    typeof q.pageSize === "string" ? q.pageSize : undefined,
  );
  const emptyLedger: {
    rows: HomeMonthlyPaymentLedgerRow[];
    totalCount: number;
    page: number;
    pageSize: number;
  } = {
    rows: [],
    totalCount: 0,
    page: 1,
    pageSize: DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE,
  };
  const ledger =
    selectedHomeId && homeRow
      ? listHomeMonthlyPaymentsLedger(db, actor, selectedHomeId, {
          page,
          pageSize,
        })
      : emptyLedger;

  return (
    <main className="flex flex-col gap-7 text-ink">
      <div className="village-reveal relative isolate overflow-hidden rounded-3xl border border-pine/12 bg-cream/85 px-5 py-6 shadow-[0_22px_60px_-36px_rgba(12,24,20,0.45)] sm:px-7">
        <div className="absolute inset-y-0 right-0 -z-10 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(184,71,50,0.15),transparent_46%),radial-gradient(circle_at_bottom_right,rgba(26,77,58,0.16),transparent_42%)]" />
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
            Admin ledger
          </p>
          <h1 className="village-page-title text-4xl">Payment history</h1>
          <p className="max-w-2xl text-sm leading-6 text-ink/70">
            Review recorded monthly bill payments by home. Add or adjust
            payments from each resident&rsquo;s Billing tab.
          </p>
        </div>
      </div>
      <HomePaymentsLedgerSection
        homes={homeOptions}
        selectedHomeId={selectedHomeId}
        defaultCurrencyCode={homeRow?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE}
        ledger={ledger}
      />
    </main>
  );
}
