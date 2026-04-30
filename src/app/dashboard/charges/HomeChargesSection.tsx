"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { buildDashboardChargesPath } from "@/lib/billing/dashboardChargesPath";
import type {
  HomeMonthlyChargeLedgerRow,
  HomeMonthlyChargesLedgerPaymentStatusFilter,
  HomeMonthlyChargesLedgerSummary,
} from "@/lib/billing/residentCharges";
import type { DashboardHomeOption } from "@/lib/dashboard/charts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  homes: DashboardHomeOption[];
  selectedHomeId: string;
  defaultCurrencyCode: string;
  /** Inclusive range actually loaded (UTC billing months). */
  billingMonthFrom: string;
  billingMonthTo: string;
  /** Calendar YTD bounds for the current instant (used to shorten URL when matching). */
  ytdBillingMonthFrom: string;
  ytdBillingMonthTo: string;
  /** True when the active range equals calendar YTD (explicit or default). */
  rangeIsDefaultYtd: boolean;
  paymentStatus: HomeMonthlyChargesLedgerPaymentStatusFilter;
  ledger: {
    rows: HomeMonthlyChargeLedgerRow[];
    totalCount: number;
    page: number;
    pageSize: number;
    summary: HomeMonthlyChargesLedgerSummary;
  };
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
  defaultCurrencyCode,
  billingMonthFrom,
  billingMonthTo,
  ytdBillingMonthFrom,
  ytdBillingMonthTo,
  rangeIsDefaultYtd,
  paymentStatus,
  ledger,
}: Props) {
  const router = useRouter();
  const [fromDraft, setFromDraft] = useState(billingMonthFrom);
  const [toDraft, setToDraft] = useState(billingMonthTo);

  useEffect(() => {
    setFromDraft(billingMonthFrom);
    setToDraft(billingMonthTo);
  }, [billingMonthFrom, billingMonthTo]);

  if (homes.length === 0) {
    return (
      <p className="village-muted mt-4">
        No active retirement homes yet. Monthly charges appear after homes exist.
      </p>
    );
  }

  const { rows, totalCount, page, pageSize, summary } = ledger;
  const selectedHomeName =
    homes.find((home) => home.homeId === selectedHomeId)?.homeName ??
    "Selected home";

  const fromIdx = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, totalCount);
  const canPrev = page > 1;
  const canNext = page * pageSize < totalCount;

  return (
    <>
      <section
        data-testid="charges-ledger-filters"
        className="village-card village-reveal village-reveal-delay-1 relative z-20"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(14rem,20rem)_1fr] lg:items-end">
          <div className="flex flex-col gap-2">
            <label htmlFor="charges-home" className="village-label">
              Home
            </label>
            <VillageSelect
              id="charges-home"
              value={selectedHomeId}
              onChange={(id) => {
                router.push(
                  buildDashboardChargesPath(
                    id,
                    billingMonthFrom,
                    billingMonthTo,
                    ytdBillingMonthFrom,
                    ytdBillingMonthTo,
                    { page: 1, paymentStatus: "all" },
                  ),
                );
              }}
              options={homes.map((h) => ({
                value: h.homeId,
                label: h.homeName,
              }))}
            />
          </div>
          <fieldset>
            <legend className="village-label">Billing month range (UTC)</legend>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex flex-col gap-1">
                <label className="village-field-label" htmlFor="charges-month-from">
                  From
                </label>
                <input
                  className="village-input min-w-40"
                  id="charges-month-from"
                  type="month"
                  value={fromDraft}
                  onChange={(e) => setFromDraft(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="village-field-label" htmlFor="charges-month-to">
                  To
                </label>
                <input
                  className="village-input min-w-40"
                  id="charges-month-to"
                  type="month"
                  value={toDraft}
                  onChange={(e) => setToDraft(e.target.value)}
                />
              </div>
              <button
                className="village-btn-primary min-h-10"
                type="button"
                onClick={() => {
                  if (!selectedHomeId) return;
                  const from = fromDraft.trim() || ytdBillingMonthFrom;
                  const to = toDraft.trim() || ytdBillingMonthTo;
                  router.push(
                    buildDashboardChargesPath(
                      selectedHomeId,
                      from,
                      to,
                      ytdBillingMonthFrom,
                      ytdBillingMonthTo,
                      { page: 1, pageSize, paymentStatus },
                    ),
                  );
                }}
              >
                Apply range
              </button>
            </div>
          </fieldset>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-pine/10 pt-4 text-sm text-ink/70">
          <span className="rounded-full bg-pine-soft px-3 py-1 font-medium text-pine-2">
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
      </section>
      {selectedHomeId ? (
        <div className="village-reveal village-reveal-delay-2 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                Total billed
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-pine-2">
                {formatMinorAsCurrency(summary.totalBilledMinor, defaultCurrencyCode)}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                {summary.chargeCount} charge{summary.chargeCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                Unpaid balance
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-terracotta">
                {formatMinorAsCurrency(summary.unpaidBalanceMinor, defaultCurrencyCode)}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                {summary.unpaidCount} unpaid
              </p>
            </div>
            <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                Collection status
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-pine-2">
                {summary.paidCount}/{summary.chargeCount}
              </p>
              <p className="mt-1 text-sm text-ink/60">charges paid</p>
            </div>
          </div>
          {totalCount > 0 || paymentStatus !== "all" ? (
            <fieldset className="flex flex-col gap-2 rounded-2xl border border-pine/12 bg-cream/75 p-3 sm:flex-row sm:items-center sm:justify-between">
              <legend className="px-1 text-sm font-semibold text-pine-2">
                Payment status
              </legend>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    name="home-charges-payment-status"
                    checked={paymentStatus === "all"}
                    onChange={() => {
                      router.push(
                        buildDashboardChargesPath(
                          selectedHomeId,
                          billingMonthFrom,
                          billingMonthTo,
                          ytdBillingMonthFrom,
                          ytdBillingMonthTo,
                          { page: 1, pageSize, paymentStatus: "all" },
                        ),
                      );
                    }}
                  />
                  <span className="block rounded-full border border-pine/15 bg-cream px-3 py-1.5 text-sm font-semibold text-ink/70 transition peer-checked:border-pine/35 peer-checked:bg-pine peer-checked:text-cream">
                    All
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    name="home-charges-payment-status"
                    checked={paymentStatus === "unpaid"}
                    onChange={() => {
                      router.push(
                        buildDashboardChargesPath(
                          selectedHomeId,
                          billingMonthFrom,
                          billingMonthTo,
                          ytdBillingMonthFrom,
                          ytdBillingMonthTo,
                          { page: 1, pageSize, paymentStatus: "unpaid" },
                        ),
                      );
                    }}
                  />
                  <span className="block rounded-full border border-pine/15 bg-cream px-3 py-1.5 text-sm font-semibold text-ink/70 transition peer-checked:border-terracotta/45 peer-checked:bg-terracotta peer-checked:text-cream">
                    Unpaid only
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    className="peer sr-only"
                    name="home-charges-payment-status"
                    checked={paymentStatus === "paid"}
                    onChange={() => {
                      router.push(
                        buildDashboardChargesPath(
                          selectedHomeId,
                          billingMonthFrom,
                          billingMonthTo,
                          ytdBillingMonthFrom,
                          ytdBillingMonthTo,
                          { page: 1, pageSize, paymentStatus: "paid" },
                        ),
                      );
                    }}
                  />
                  <span className="block rounded-full border border-pine/15 bg-cream px-3 py-1.5 text-sm font-semibold text-ink/70 transition peer-checked:border-pine/35 peer-checked:bg-pine peer-checked:text-cream">
                    Paid only
                  </span>
                </label>
              </div>
            </fieldset>
          ) : null}
          <div className="overflow-hidden rounded-3xl border border-pine/12 bg-cream/90 shadow-[0_20px_58px_-34px_rgba(12,24,20,0.5)]">
            <div className="flex flex-col gap-1 border-b border-pine/10 bg-[linear-gradient(135deg,rgba(250,247,241,0.96),rgba(240,232,220,0.86))] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                  Ledger table
                </p>
                <h2 className="text-base font-semibold text-pine-2">
                  Resident charge details
                </h2>
              </div>
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
                <p
                  className="text-sm text-ink/60"
                  data-testid="charges-ledger-range"
                >
                  {totalCount === 0
                    ? "Showing 0 of 0"
                    : `Showing ${fromIdx}–${toIdx} of ${totalCount}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canPrev}
                    onClick={() => {
                      router.push(
                        buildDashboardChargesPath(
                          selectedHomeId,
                          billingMonthFrom,
                          billingMonthTo,
                          ytdBillingMonthFrom,
                          ytdBillingMonthTo,
                          { page: page - 1, pageSize, paymentStatus },
                        ),
                      );
                    }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canNext}
                    onClick={() => {
                      router.push(
                        buildDashboardChargesPath(
                          selectedHomeId,
                          billingMonthFrom,
                          billingMonthTo,
                          ytdBillingMonthFrom,
                          ytdBillingMonthTo,
                          { page: page + 1, pageSize, paymentStatus },
                        ),
                      );
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
            <table
              aria-label="Monthly charge ledger"
              className="min-w-full border-collapse text-left text-sm"
            >
            <thead>
              <tr className="border-b border-pine/12 bg-pine-soft/80">
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
                  Resident
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
                  Status
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
                  Billing month
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
                  Amount
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
                  Ward
                </th>
                <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
                  Paid
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pine/8 bg-cream/70">
              {totalCount === 0 && paymentStatus === "all" ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-pine/20 bg-cream-muted/55 px-6 py-7">
                      <p className="font-semibold text-pine-2">
                        No monthly charges in this range for this home.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-ink/60">
                        Adjust the billing window above or select another home
                        to review generated charges.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : totalCount === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-ink/60"
                    data-testid="charges-ledger-filter-empty"
                  >
                    No rows match this filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-pine-soft/45"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/homes/${selectedHomeId}/residents/${row.residentId}?tab=billing`}
                        className="font-semibold text-pine underline decoration-terracotta/35 underline-offset-4 transition hover:text-terracotta"
                      >
                        {row.residentFullName}
                      </Link>
                    </td>
                    <td className="px-5 py-4 capitalize text-ink/85">
                      <span className="rounded-full border border-pine/12 bg-cream px-2.5 py-1 text-xs font-semibold text-ink/70">
                        {row.residentStatus === "active" ? "Active" : "Departed"}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs tabular-nums text-ink/75">
                      {row.billingMonth}
                    </td>
                    <td className="px-5 py-4 font-semibold tabular-nums text-ink">
                      {formatMinorAsCurrency(
                        row.amountMinorSnapshot,
                        defaultCurrencyCode,
                      )}
                    </td>
                    <td className="px-5 py-4 text-ink/75">
                      {row.wardLabel ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          row.paid
                            ? "rounded-full bg-success-muted px-2.5 py-1 text-xs font-semibold text-success"
                            : "rounded-full bg-danger-bg px-2.5 py-1 text-xs font-semibold text-danger"
                        }
                      >
                        {row.paid ? "Paid" : "Unpaid"}
                      </span>
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
