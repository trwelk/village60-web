"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { buildDashboardOtherChargesPath } from "@/lib/billing/dashboardOtherChargesPath";
import type { DashboardHomeOption } from "@/lib/dashboard/charts";
import type {
  HomeOtherChargeLedgerRow,
  HomeOtherChargesReceivedFilter,
  HomeOtherChargesLedgerSummary,
} from "@/lib/billing/residentCharges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";

type ResidentOption = { id: string; fullName: string };

type LedgerSlice = {
  rows: HomeOtherChargeLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeOtherChargesLedgerSummary;
};

const FILTER_LOADING_SUMMARY: HomeOtherChargesLedgerSummary = {
  totalAmountMinor: 0,
  outstandingAmountMinor: 0,
  receivedLineCount: 0,
};

type Props = {
  homes: DashboardHomeOption[];
  selectedHomeId: string;
  defaultCurrencyCode: string;
  selectedResidentId: string;
  ledger: LedgerSlice;
  residentsInHome: ResidentOption[];
};

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

function typeLabel(type: HomeOtherChargeLedgerRow["type"]): string {
  return type === "registration" ? "Registration" : "Deposit";
}

export function HomeOtherChargesSection({
  homes,
  selectedHomeId,
  defaultCurrencyCode,
  selectedResidentId,
  ledger,
  residentsInHome,
}: Props) {
  const router = useRouter();
  const [payFilter, setPayFilter] =
    useState<HomeOtherChargesReceivedFilter>("all");
  const [filterPage, setFilterPage] = useState(1);
  const [clientLedger, setClientLedger] = useState<LedgerSlice | null>(null);
  const [filterFetchState, setFilterFetchState] = useState<
    "idle" | "loading" | "error"
  >("idle");

  useEffect(() => {
    setPayFilter("all");
    setClientLedger(null);
    setFilterFetchState("idle");
  }, [selectedHomeId]);

  useLayoutEffect(() => {
    setFilterPage(1);
  }, [payFilter, selectedHomeId, selectedResidentId]);

  useEffect(() => {
    if (payFilter === "all" || !selectedHomeId) {
      setClientLedger(null);
      setFilterFetchState("idle");
      return;
    }
    const ac = new AbortController();
    setFilterFetchState("loading");
    (async () => {
      try {
        const u = new URL(
          `/api/homes/${selectedHomeId}/other-charges`,
          window.location.origin,
        );
        if (selectedResidentId.trim()) {
          u.searchParams.set("residentId", selectedResidentId.trim());
        }
        u.searchParams.set("status", payFilter);
        u.searchParams.set("page", String(filterPage));
        u.searchParams.set("pageSize", String(ledger.pageSize));
        const res = await fetch(u.toString(), { signal: ac.signal });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = (await res.json()) as {
          rows: HomeOtherChargeLedgerRow[];
          totalCount: number;
          page: number;
          pageSize: number;
          summary: HomeOtherChargesLedgerSummary;
        };
        setClientLedger({
          rows: data.rows,
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
    payFilter,
    selectedHomeId,
    selectedResidentId,
    filterPage,
    ledger.pageSize,
  ]);

  if (homes.length === 0) {
    return (
      <p className="village-muted mt-4">
        No active retirement homes yet. Other charges appear after homes and
        residents exist.
      </p>
    );
  }

  const displayLedger: LedgerSlice =
    payFilter === "all"
      ? ledger
      : clientLedger ?? {
          rows: [],
          totalCount: 0,
          page: filterPage,
          pageSize: ledger.pageSize,
          summary: FILTER_LOADING_SUMMARY,
        };

  const { rows, totalCount, page, pageSize, summary } = displayLedger;
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const canPrev = page > 1;
  const canNext = page * pageSize < totalCount;
  const unpaidLineCount = totalCount - summary.receivedLineCount;

  const residentOptions: { value: string; label: string }[] = [
    { value: "", label: "All residents" },
    ...residentsInHome.map((r) => ({ value: r.id, label: r.fullName })),
  ];
  const selectedHomeName =
    homes.find((home) => home.homeId === selectedHomeId)?.homeName ??
    "Selected home";
  const selectedResidentName =
    residentsInHome.find((resident) => resident.id === selectedResidentId)
      ?.fullName ?? "All residents";
  return (
    <>
      <section
        data-testid="other-charges-ledger-filters"
        className="village-card village-reveal village-reveal-delay-1 relative z-20 rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-5 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-6"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(14rem,20rem)_1fr] lg:items-end">
          <div className="flex flex-col gap-2">
            <label htmlFor="other-charges-home" className="village-label">
              Home
            </label>
            <VillageSelect
              id="other-charges-home"
              value={selectedHomeId}
                onChange={(id) => {
                  setPayFilter("all");
                  router.push(
                  buildDashboardOtherChargesPath(
                    id,
                    "",
                    "all",
                    1,
                    ledger.pageSize,
                  ),
                );
              }}
              options={homes.map((h) => ({
                value: h.homeId,
                label: h.homeName,
              }))}
            />
          </div>
          {selectedHomeId ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="other-charges-resident" className="village-label">
                Resident
              </label>
              <VillageSelect
                id="other-charges-resident"
                value={selectedResidentId}
                onChange={(rid) => {
                  router.push(
                    buildDashboardOtherChargesPath(
                      selectedHomeId,
                      rid,
                      "all",
                      1,
                      ledger.pageSize,
                    ),
                  );
                }}
                options={residentOptions}
              />
            </div>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-4 text-sm text-[var(--text-secondary)]">
          <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-3 py-1.5 font-medium text-[var(--text-primary)]">
            {selectedHomeName}
          </span>
          <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-3 py-1.5 font-medium text-[var(--text-primary)]">
            {selectedResidentName}
          </span>
          <span>
            {totalCount === 0
              ? "No other charges in this view."
              : `Showing ${totalCount} other charge${
                  totalCount === 1 ? "" : "s"
                } for this home and filter.`}
          </span>
        </div>
      </section>

      {selectedHomeId ? (
        <div className="village-reveal village-reveal-delay-2 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                Total charges
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-pine-2">
                {formatMinorAsCurrency(
                  summary.totalAmountMinor,
                  defaultCurrencyCode,
                )}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                {totalCount} line{totalCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                Outstanding
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-terracotta">
                {formatMinorAsCurrency(
                  summary.outstandingAmountMinor,
                  defaultCurrencyCode,
                )}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                {unpaidLineCount} unpaid
              </p>
            </div>
            <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                Received status
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-pine-2">
                {summary.receivedLineCount}/{totalCount}
              </p>
              <p className="mt-1 text-sm text-ink/60">lines received</p>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2 rounded-2xl border border-pine/12 bg-cream/75 p-3 sm:flex-row sm:items-center sm:justify-between">
            <legend className="px-1 text-sm font-semibold text-pine-2">
              Payment status
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["unpaid", "Unpaid"],
                  ["paid", "Paid"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    name="other-charges-payment-status"
                    checked={payFilter === value}
                    onChange={() => {
                      setPayFilter(value);
                    }}
                  />
                  <span className="block rounded-full border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition peer-checked:border-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] peer-checked:bg-[var(--accent-strong)] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--bg-elevated)]">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {filterFetchState === "error" && payFilter !== "all" ? (
            <p
              className="rounded-2xl border border-terracotta/35 bg-cream-muted/55 px-4 py-3 text-sm text-terracotta"
              role="alert"
            >
              Could not load filtered lines. Try again or refresh the page.
            </p>
          ) : null}

          <div
            className="overflow-hidden rounded-3xl border border-pine/12 bg-cream/90 shadow-[0_20px_58px_-34px_rgba(12,24,20,0.5)]"
            data-testid="other-charges-ledger"
          >
            <div className="flex flex-col gap-1 border-b border-pine/10 bg-[linear-gradient(135deg,rgba(250,247,241,0.96),rgba(240,232,220,0.86))] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                  Ledger table
                </p>
                <h2 className="text-base font-semibold text-pine-2">
                  Registration and deposit details
                </h2>
              </div>
              <p
                className="text-sm text-ink/60"
                data-testid="other-charges-ledger-range"
              >
                {totalCount === 0
                  ? "Showing 0 of 0"
                  : `Showing ${from}–${to} of ${totalCount}`}
              </p>
            </div>
            {totalCount > 0 ? (
              <div className="flex flex-wrap gap-2 border-t border-pine/10 bg-cream/40 px-5 py-3 sm:justify-end">
                <button
                  type="button"
                  className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!canPrev}
                  onClick={() => {
                    if (payFilter === "all") {
                      router.push(
                        buildDashboardOtherChargesPath(
                          selectedHomeId,
                          selectedResidentId,
                          "all",
                          page - 1,
                          pageSize,
                        ),
                      );
                    } else {
                      setFilterPage((p) => Math.max(1, p - 1));
                    }
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!canNext}
                  onClick={() => {
                    if (payFilter === "all") {
                      router.push(
                        buildDashboardOtherChargesPath(
                          selectedHomeId,
                          selectedResidentId,
                          "all",
                          page + 1,
                          pageSize,
                        ),
                      );
                    } else {
                      setFilterPage((p) => p + 1);
                    }
                  }}
                >
                  Next
                </button>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table
                aria-label="Other charges ledger"
                className="min-w-full border-collapse text-left text-sm"
              >
                <thead>
                  <tr className="border-b border-pine/12 bg-pine-soft/80">
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine"
                    >
                      Resident
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine"
                    >
                      Type
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine"
                    >
                      Received
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine"
                    >
                      Paid on
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine"
                    >
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pine/8 bg-cream/70">
                  {rows.length === 0 &&
                  filterFetchState === "loading" &&
                  payFilter !== "all" ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-12 text-center text-ink/60"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <div className="mx-auto max-w-md rounded-2xl border border-dashed border-pine/20 bg-cream-muted/55 px-6 py-7">
                          <p className="font-semibold text-pine-2">
                            No other charges match this filter for this home.
                          </p>
                          <p className="mt-2 text-sm leading-6 text-ink/60">
                            Try a different resident or payment status to review
                            registration and deposit lines.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className="transition-colors hover:bg-pine-soft/45"
                      >
                        <td className="px-5 py-4 font-semibold text-pine-2">
                          {row.residentFullName}
                        </td>
                        <td className="px-5 py-4 text-ink/80">
                          <span className="rounded-full border border-pine/12 bg-cream px-2.5 py-1 text-xs font-semibold text-ink/70">
                            {typeLabel(row.type)}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-semibold tabular-nums text-ink">
                          {formatMinorAsCurrency(
                            row.amountMinor,
                            defaultCurrencyCode,
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={
                              row.received
                                ? "rounded-full bg-success-muted px-2.5 py-1 text-xs font-semibold text-success"
                                : "rounded-full bg-danger-bg px-2.5 py-1 text-xs font-semibold text-danger"
                            }
                          >
                            {row.received ? "Received" : "Unpaid"}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs tabular-nums text-ink/75">
                          {row.paidOn ?? "—"}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/dashboard/homes/${selectedHomeId}/residents/${row.residentId}?tab=other-charge`}
                            className="village-link"
                          >
                            Open
                          </Link>
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
    </>
  );
}
