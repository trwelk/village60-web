"use client";

/* eslint-disable react-hooks/set-state-in-effect -- intentional sync Effects */

import { VillageList, VillageListPagination } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import { buildDashboardChargesPath } from "@/lib/billing/dashboardChargesPath";
import type { DashboardHomeOption } from "@/lib/dashboard/charts";
import type {
  HomeMonthlyChargeLedgerRow,
  HomeMonthlyChargesLedgerPaymentStatusFilter,
  HomeMonthlyChargesLedgerSummary,
} from "@/lib/billing/residentCharges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState, useTransition } from "react";

type LedgerSlice = {
  rows: HomeMonthlyChargeLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeMonthlyChargesLedgerSummary;
};

const FILTER_LOADING_SUMMARY: HomeMonthlyChargesLedgerSummary = {
  totalBilledMinor: 0,
  chargeCount: 0,
  paidCount: 0,
  unpaidCount: 0,
  unpaidBalanceMinor: 0,
};

type Props = {
  homes: DashboardHomeOption[];
  selectedHomeId: string;
  selectedResidentId: string | null;
  residentOptions: {
    residentId: string;
    residentFullName: string;
    residentStatus: string;
  }[];
  defaultCurrencyCode: string;
  /** Inclusive range actually loaded (UTC billing months). */
  billingMonthFrom: string;
  billingMonthTo: string;
  /** Calendar YTD bounds for the current instant (used to shorten URL when matching). */
  ytdBillingMonthFrom: string;
  ytdBillingMonthTo: string;
  /** True when the active range equals calendar YTD (explicit or default). */
  rangeIsDefaultYtd: boolean;
  /** Server ledger for payment status &quot;all&quot; (URL-driven home, range, pagination). */
  ledger: LedgerSlice;
};

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

export function HomeChargesSection({
  homes,
  selectedHomeId,
  selectedResidentId,
  residentOptions,
  defaultCurrencyCode,
  billingMonthFrom,
  billingMonthTo,
  ytdBillingMonthFrom,
  ytdBillingMonthTo,
  rangeIsDefaultYtd,
  ledger,
}: Props) {
  const router = useRouter();
  const [fromDraft, setFromDraft] = useState(billingMonthFrom);
  const [toDraft, setToDraft] = useState(billingMonthTo);
  const [residentFilter, setResidentFilter] = useState<string | null>(
    selectedResidentId,
  );
  const [paymentFilter, setPaymentFilter] =
    useState<HomeMonthlyChargesLedgerPaymentStatusFilter>("all");
  const [filteredPage, setFilteredPage] = useState(1);
  const [clientLedger, setClientLedger] = useState<LedgerSlice | null>(null);
  const [isApplyingRange, startApplyingRange] = useTransition();
  const [filterFetchState, setFilterFetchState] = useState<
    "idle" | "loading" | "error"
  >("idle");

  useEffect(() => {
    setFromDraft(billingMonthFrom);
    setToDraft(billingMonthTo);
    setResidentFilter(selectedResidentId);
  }, [billingMonthFrom, billingMonthTo, selectedResidentId]);

  useEffect(() => {
    setPaymentFilter("all");
    setClientLedger(null);
    setFilterFetchState("idle");
  }, [selectedHomeId, billingMonthFrom, billingMonthTo, residentFilter]);

  useLayoutEffect(() => {
    setFilteredPage(1);
  }, [
    paymentFilter,
    selectedHomeId,
    billingMonthFrom,
    billingMonthTo,
    residentFilter,
  ]);

  useEffect(() => {
    if (paymentFilter === "all" || !selectedHomeId) {
      setClientLedger(null);
      setFilterFetchState("idle");
      return;
    }
    const ac = new AbortController();
    setFilterFetchState("loading");
    (async () => {
      try {
        const u = new URL(
          `/api/homes/${selectedHomeId}/monthly-charges`,
          window.location.origin,
        );
        u.searchParams.set("billingMonthFrom", billingMonthFrom);
        u.searchParams.set("billingMonthTo", billingMonthTo);
        u.searchParams.set("paymentStatus", paymentFilter);
        if (residentFilter) {
          u.searchParams.set("residentId", residentFilter);
        }
        u.searchParams.set("page", String(filteredPage));
        u.searchParams.set("pageSize", String(ledger.pageSize));
        const res = await fetch(u.toString(), { signal: ac.signal });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = (await res.json()) as {
          charges: HomeMonthlyChargeLedgerRow[];
          totalCount: number;
          page: number;
          pageSize: number;
          summary: HomeMonthlyChargesLedgerSummary;
        };
        setClientLedger({
          rows: data.charges,
          totalCount: data.totalCount,
          page: data.page,
          pageSize: data.pageSize,
          summary: data.summary,
        });
        setFilterFetchState("idle");
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          return;
        }
        setFilterFetchState("error");
      }
    })();
    return () => ac.abort();
  }, [
    paymentFilter,
    selectedHomeId,
    billingMonthFrom,
    billingMonthTo,
    residentFilter,
    filteredPage,
    ledger.pageSize,
  ]);

  if (homes.length === 0) {
    return (
      <p className="village-muted mt-4">
        No active retirement homes yet. Monthly charges appear after homes exist.
      </p>
    );
  }

  const selectedHomeName =
    homes.find((home) => home.homeId === selectedHomeId)?.homeName ??
    "Selected home";

  const displayLedger: LedgerSlice =
    paymentFilter === "all"
      ? ledger
      : clientLedger ?? {
          rows: [],
          totalCount: 0,
          page: filteredPage,
          pageSize: ledger.pageSize,
          summary: FILTER_LOADING_SUMMARY,
        };

  const { rows, totalCount, page, pageSize, summary } = displayLedger;

  const normalizedFromDraft = fromDraft.trim() || ytdBillingMonthFrom;
  const normalizedToDraft = toDraft.trim() || ytdBillingMonthTo;
  const hasRangeDraftChanges =
    normalizedFromDraft !== billingMonthFrom || normalizedToDraft !== billingMonthTo;
  const hasInvalidRange = normalizedFromDraft > normalizedToDraft;
  const isApplyRangeDisabled =
    !selectedHomeId || !hasRangeDraftChanges || hasInvalidRange || isApplyingRange;

  const chargesActiveFilterCount =
    (selectedResidentId ? 1 : 0) + (!rangeIsDefaultYtd ? 1 : 0);

  return (
    <>
      <VillageList
        rootElement="div"
        wrapBody="none"
        listTitle={null}
        filtersCollapsible
        activeFilterCount={chargesActiveFilterCount}
        loading={
          isApplyingRange ||
          (paymentFilter !== "all" && filterFetchState === "loading")
        }
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1" aria-hidden />
            <button
              type="button"
              className="village-btn-secondary shrink-0"
              onClick={() => router.refresh()}
            >
              Refresh
            </button>
          </div>
        }
        filters={
          <div
            className="flex w-full min-w-0 flex-[1_1_100%] flex-col gap-4"
            data-testid="charges-ledger-filters"
          >
        <div className="grid gap-4 lg:grid-cols-[minmax(12rem,16rem)_minmax(16rem,1fr)_minmax(18rem,1.1fr)_auto] lg:items-end">
          <div className="flex flex-col gap-2">
            <label htmlFor="charges-home" className="village-label">
              Home
            </label>
            <VillageSelect
              id="charges-home"
              value={selectedHomeId}
              onChange={(id) => {
                setPaymentFilter("all");
                router.push(
                  buildDashboardChargesPath(
                    id,
                    billingMonthFrom,
                    billingMonthTo,
                    ytdBillingMonthFrom,
                    ytdBillingMonthTo,
                    { page: 1, residentId: null },
                  ),
                );
              }}
              options={homes.map((h) => ({
                value: h.homeId,
                label: h.homeName,
              }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="charges-resident" className="village-label">
              Resident (optional)
            </label>
            <VillageSelect
              id="charges-resident"
              value={residentFilter ?? ""}
              onChange={(id) => {
                const nextResidentId = id === "" ? null : id;
                setResidentFilter(nextResidentId);
                setPaymentFilter("all");
                if (!selectedHomeId) return;
                router.push(
                  buildDashboardChargesPath(
                    selectedHomeId,
                    billingMonthFrom,
                    billingMonthTo,
                    ytdBillingMonthFrom,
                    ytdBillingMonthTo,
                    { page: 1, residentId: nextResidentId },
                  ),
                );
              }}
              options={[
                { value: "", label: "All residents" },
                ...residentOptions.map((r) => ({
                  value: r.residentId,
                  label:
                    r.residentStatus === "active"
                      ? r.residentFullName
                      : `${r.residentFullName} (Departed)`,
                })),
              ]}
            />
          </div>
          <fieldset className="min-w-0">
            <legend className="village-label">Billing month range (UTC)</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label className="village-field-label" htmlFor="charges-month-from">
                  From
                </label>
                <input
                  className="village-input min-w-0"
                  id="charges-month-from"
                  type="month"
                  value={fromDraft}
                  onChange={(e) => setFromDraft(e.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label className="village-field-label" htmlFor="charges-month-to">
                  To
                </label>
                <input
                  className="village-input min-w-0"
                  id="charges-month-to"
                  type="month"
                  value={toDraft}
                  onChange={(e) => setToDraft(e.target.value)}
                />
              </div>
            </div>
          </fieldset>
          <button
            className="h-10 w-full rounded-xl border border-[color:color-mix(in_srgb,var(--accent-strong)_72%,transparent)] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] disabled:bg-[color:color-mix(in_srgb,var(--bg-muted)_84%,transparent)] disabled:text-[var(--text-muted)] lg:w-auto"
            type="button"
            disabled={isApplyRangeDisabled}
            aria-busy={isApplyingRange}
            onClick={() => {
              if (isApplyRangeDisabled || !selectedHomeId) return;
              startApplyingRange(() => {
                setPaymentFilter("all");
                router.push(
                  buildDashboardChargesPath(
                    selectedHomeId,
                    normalizedFromDraft,
                    normalizedToDraft,
                    ytdBillingMonthFrom,
                    ytdBillingMonthTo,
                    {
                      page: 1,
                      pageSize: ledger.pageSize,
                      residentId: residentFilter,
                    },
                  ),
                );
              });
            }}
          >
            {isApplyingRange ? "Applying..." : "Apply range"}
          </button>
        </div>
        {hasInvalidRange ? (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            From month must be earlier than or equal to To month.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-4 text-sm text-[var(--text-secondary)]">
          <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-3 py-1.5 font-medium text-[var(--text-primary)]">
            {selectedHomeName}
          </span>
          <span>
            Showing billing months <strong>{billingMonthFrom}</strong> through{" "}
            <strong>{billingMonthTo}</strong>{" "}
            {rangeIsDefaultYtd
              ? "(calendar year-to-date, UTC)."
              : "(selected range, UTC)."}
          </span>
        </div>
          </div>
        }
      >
      {selectedHomeId ? (
        <div className="village-reveal village-reveal-delay-2 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
              <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                Total billed
              </p>
              <p className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[2.1rem]">
                {formatMinorAsCurrency(summary.totalBilledMinor, defaultCurrencyCode)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {summary.chargeCount} charge{summary.chargeCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--danger)_38%,var(--line-strong)_62%)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
              <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                Unpaid balance
              </p>
              <p className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-[var(--danger)] sm:text-[2.1rem]">
                {formatMinorAsCurrency(summary.unpaidBalanceMinor, defaultCurrencyCode)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {summary.unpaidCount} unpaid
              </p>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
              <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                Collection status
              </p>
              <p className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[2.1rem]">
                {summary.paidCount}/{summary.chargeCount}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">charges paid</p>
            </div>
          </div>
          {ledger.totalCount > 0 || paymentFilter !== "all" ? (
            <fieldset className="flex flex-col gap-2 rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_78%,transparent)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">
                Payment status
              </legend>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    name="home-charges-payment-status"
                    checked={paymentFilter === "all"}
                    onChange={() => {
                      setPaymentFilter("all");
                    }}
                  />
                  <span className="block rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition peer-checked:border-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] peer-checked:bg-[var(--accent-strong)] peer-checked:text-white">
                    All
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    name="home-charges-payment-status"
                    checked={paymentFilter === "unpaid"}
                    onChange={() => {
                      setPaymentFilter("unpaid");
                    }}
                  />
                  <span className="block rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition peer-checked:border-[color:color-mix(in_srgb,var(--danger)_55%,transparent)] peer-checked:bg-[var(--danger)] peer-checked:text-white">
                    Unpaid only
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    name="home-charges-payment-status"
                    checked={paymentFilter === "paid"}
                    onChange={() => {
                      setPaymentFilter("paid");
                    }}
                  />
                  <span className="block rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition peer-checked:border-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] peer-checked:bg-[var(--accent-strong)] peer-checked:text-white">
                    Paid only
                  </span>
                </label>
              </div>
            </fieldset>
          ) : null}
          {filterFetchState === "error" && paymentFilter !== "all" ? (
            <p
              className="rounded-2xl border border-[color:color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)] px-4 py-3 text-sm text-[var(--danger)]"
              role="alert"
            >
              Could not load filtered charges. Try again or refresh the page.
            </p>
          ) : null}
          <div className="rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] shadow-[0_20px_58px_-34px_color-mix(in_srgb,var(--accent)_34%,transparent)]">
            <div className="flex flex-col gap-1 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Ledger table
                </p>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Resident charge details
                </h2>
              </div>
              <div className="w-full min-w-0 sm:max-w-[min(100%,28rem)] sm:self-end">
                <VillageListPagination
                  className="mt-0 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  page={page}
                  pageSize={pageSize}
                  totalCount={totalCount}
                  loading={
                    paymentFilter !== "all" && filterFetchState === "loading"
                  }
                  rangeTestId="charges-ledger-range"
                  onPrevious={() => {
                    if (paymentFilter === "all") {
                      router.push(
                        buildDashboardChargesPath(
                          selectedHomeId,
                          billingMonthFrom,
                          billingMonthTo,
                          ytdBillingMonthFrom,
                          ytdBillingMonthTo,
                          {
                            page: page - 1,
                            pageSize,
                            residentId: residentFilter,
                          },
                        ),
                      );
                    } else {
                      setFilteredPage((p) => Math.max(1, p - 1));
                    }
                  }}
                  onNext={() => {
                    if (paymentFilter === "all") {
                      router.push(
                        buildDashboardChargesPath(
                          selectedHomeId,
                          billingMonthFrom,
                          billingMonthTo,
                          ytdBillingMonthFrom,
                          ytdBillingMonthTo,
                          {
                            page: page + 1,
                            pageSize,
                            residentId: residentFilter,
                          },
                        ),
                      );
                    } else {
                      setFilteredPage((p) => p + 1);
                    }
                  }}
                />
              </div>
            </div>
            <div
              className={[
                "overflow-x-auto rounded-b-3xl",
                filterFetchState === "loading" &&
                paymentFilter !== "all" &&
                rows.length > 0
                  ? "pointer-events-none opacity-50 transition-opacity duration-150 motion-reduce:transition-none"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
            <table
              aria-label="Monthly charge ledger"
              className="min-w-full border-collapse text-left text-sm"
            >
            <thead>
              <tr className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)]">
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Resident
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Description
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Category
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Amount
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Currency
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Paid
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Period
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:color-mix(in_srgb,var(--line-subtle)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_84%,transparent)]">
              {totalCount === 0 && paymentFilter === "all" ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_74%,transparent)] px-6 py-7">
                      <p className="font-semibold text-[var(--text-primary)]">
                        No monthly charges in this range for this home.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        Adjust the billing window above or select another home
                        to review generated charges.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : totalCount === 0 &&
                filterFetchState === "loading" &&
                paymentFilter !== "all" ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-[var(--text-secondary)]"
                  >
                    Loading…
                  </td>
                </tr>
              ) : totalCount === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-[var(--text-secondary)]"
                    data-testid="charges-ledger-filter-empty"
                  >
                    No rows match this filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_76%,transparent)]"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/invoices?homeId=${encodeURIComponent(selectedHomeId)}&residentId=${encodeURIComponent(row.residentId)}`}
                        className="font-semibold text-[var(--accent-strong)] underline decoration-[color:color-mix(in_srgb,var(--accent)_36%,transparent)] underline-offset-4 transition hover:text-[var(--accent)]"
                      >
                        {row.residentFullName}
                      </Link>
                    </td>
                    <td className="max-w-[min(28rem,48vw)] min-w-[8rem] px-5 py-4 text-[var(--text-primary)]">
                      {row.invoiceLineDescription.trim() === ""
                        ? "—"
                        : row.invoiceLineDescription}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                        {row.invoiceLineCategory}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold tabular-nums text-[var(--text-primary)]">
                      {formatMinorAsCurrency(
                        row.amountMinorSnapshot,
                        defaultCurrencyCode,
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs uppercase tabular-nums text-[var(--text-secondary)]">
                      {defaultCurrencyCode}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          row.paid
                            ? "rounded-xl bg-success-muted px-2.5 py-1 text-xs font-semibold text-success"
                            : "rounded-xl bg-danger-bg px-2.5 py-1 text-xs font-semibold text-danger"
                        }
                      >
                        {row.paid ? "Paid" : "Unpaid"}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {row.billingMonth}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
            </div>
        </div>
        </div>
      ) : null}
      </VillageList>
    </>
  );
}
