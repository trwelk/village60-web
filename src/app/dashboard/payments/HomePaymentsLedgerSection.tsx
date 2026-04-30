"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { buildDashboardPaymentsPath } from "@/lib/billing/dashboardPaymentsPath";
import type { HomeMonthlyPaymentLedgerRow } from "@/lib/billing/residentCharges";
import type { DashboardHomeOption } from "@/lib/dashboard/charts";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  homes: DashboardHomeOption[];
  selectedHomeId: string;
  defaultCurrencyCode: string;
  ledger: {
    rows: HomeMonthlyPaymentLedgerRow[];
    totalCount: number;
    page: number;
    pageSize: number;
  };
};

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

export function HomePaymentsLedgerSection({
  homes,
  selectedHomeId,
  defaultCurrencyCode,
  ledger,
}: Props) {
  const router = useRouter();
  const { rows, totalCount, page, pageSize } = ledger;

  if (homes.length === 0) {
    return (
      <p className="village-muted mt-4">
        No active retirement homes yet. Payment history appears after homes exist.
      </p>
    );
  }

  const from =
    totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const canPrev = page > 1;
  const canNext = page * pageSize < totalCount;
  const selectedHomeName =
    homes.find((home) => home.homeId === selectedHomeId)?.homeName ??
    "Selected home";
  const visibleAmountMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
  const uniqueResidentCount = new Set(rows.map((row) => row.residentId)).size;
  const rangeText =
    totalCount === 0 ? "Showing 0 of 0" : `Showing ${from}–${to} of ${totalCount}`;

  return (
    <>
      <section
        data-testid="payments-ledger-filters"
        className="village-card village-reveal village-reveal-delay-1 relative z-20"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(14rem,20rem)_1fr] lg:items-end">
          <div className="flex flex-col gap-2">
            <label htmlFor="payments-ledger-home" className="village-label">
              Home
            </label>
          <VillageSelect
            id="payments-ledger-home"
            value={selectedHomeId}
            onChange={(id) => {
              router.push(buildDashboardPaymentsPath(id, 1, pageSize));
            }}
            options={homes.map((h) => ({
              value: h.homeId,
              label: h.homeName,
            }))}
          />
          </div>
          <div className="rounded-2xl border border-pine/10 bg-cream-muted/55 px-4 py-3">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
              Current view
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink/70">
              <span className="rounded-full bg-pine-soft px-3 py-1 font-medium text-pine-2">
                {selectedHomeName}
              </span>
              <span data-testid="payments-ledger-range">{rangeText}</span>
            </div>
          </div>
        </div>
      </section>

      {selectedHomeId ? (
        <div className="village-reveal village-reveal-delay-2 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                Visible payments
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-pine-2">
                {formatMinorAsCurrency(visibleAmountMinor, defaultCurrencyCode)}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                {rows.length} payment{rows.length === 1 ? "" : "s"} on this page
              </p>
            </div>
            <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                Residents
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-pine-2">
                {uniqueResidentCount}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                represented on this page
              </p>
            </div>
            <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                Ledger depth
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-pine-2">
                {totalCount}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                total recorded payment{totalCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-pine/12 bg-cream/75 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="px-1 text-sm font-semibold text-pine-2">
              Payment ledger
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="village-btn-secondary px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canPrev}
                onClick={() => {
                  router.push(
                    buildDashboardPaymentsPath(
                      selectedHomeId,
                      page - 1,
                      pageSize,
                    ),
                  );
                }}
              >
                Previous
              </button>
              <button
                type="button"
                className="village-btn-secondary px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canNext}
                onClick={() => {
                  router.push(
                    buildDashboardPaymentsPath(
                      selectedHomeId,
                      page + 1,
                      pageSize,
                    ),
                  );
                }}
              >
                Next
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-pine/12 bg-cream/90 shadow-[0_20px_58px_-34px_rgba(12,24,20,0.5)]">
            <div className="flex flex-col gap-1 border-b border-pine/10 bg-[linear-gradient(135deg,rgba(250,247,241,0.96),rgba(240,232,220,0.86))] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
                  Ledger table
                </p>
                <h2 className="text-base font-semibold text-pine-2">
                  Recorded payment details
                </h2>
              </div>
              <p className="text-sm text-ink/60">{rangeText}</p>
            </div>
            <div className="overflow-x-auto">
            <table
              data-testid="payments-ledger-table"
              aria-label="Monthly payment ledger"
              className="min-w-full border-collapse text-left text-sm"
            >
              <thead>
                <tr className="border-b border-pine/12 bg-pine-soft/80">
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
                    Paid on
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
                    Amount
                  </th>
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
                    Notes
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-pine">
                    Recorded by
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pine/8 bg-cream/70">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center"
                    >
                      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-pine/20 bg-cream-muted/55 px-6 py-7">
                        <p className="font-semibold text-pine-2">
                          No recorded monthly payments for this home yet.
                        </p>
                        <p className="mt-2 text-sm leading-6 text-ink/60">
                          Payments will appear here after they are recorded from
                          a resident&rsquo;s Billing tab.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.paymentId}
                      className="transition-colors hover:bg-pine-soft/45"
                    >
                      <td className="px-5 py-4 font-mono text-xs tabular-nums text-ink/75">
                        {row.paidOn}
                      </td>
                      <td className="px-5 py-4 font-semibold tabular-nums text-ink">
                        {formatMinorAsCurrency(
                          row.amountMinor,
                          defaultCurrencyCode,
                        )}
                      </td>
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
                      <td className="max-w-[18rem] px-5 py-4 text-ink/75">
                        {row.notes?.trim() ? row.notes : "—"}
                      </td>
                      <td className="px-5 py-4 text-ink/75">
                        {row.recordedByEmail}
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
