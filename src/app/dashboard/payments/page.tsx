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
      <HomePaymentsLedgerSection
        homes={homeOptions}
        selectedHomeId={selectedHomeId}
        defaultCurrencyCode={homeRow?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE}
        ledger={ledger}
      />
    </main>
  );
}
