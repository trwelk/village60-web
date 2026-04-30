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
        className="village-card village-reveal village-reveal-delay-1 relative z-20 rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-5 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-6"
      >
        <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_78%,transparent)] p-4 sm:p-5">
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:gap-8">
            <div className="flex min-w-0 w-full flex-col gap-2 lg:max-w-[20rem] lg:shrink-0">
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
            <div className="min-w-0 flex-1 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Current view
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="rounded-full bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1 font-medium text-[var(--text-primary)]">
                  {selectedHomeName}
                </span>
                <span data-testid="payments-ledger-range">{rangeText}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {selectedHomeId ? (
        <div className="village-reveal village-reveal-delay-2 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Visible payments
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                {formatMinorAsCurrency(visibleAmountMinor, defaultCurrencyCode)}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {rows.length} payment{rows.length === 1 ? "" : "s"} on this page
              </p>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Residents
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                {uniqueResidentCount}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                represented on this page
              </p>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Ledger depth
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                {totalCount}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                total recorded payment{totalCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_78%,transparent)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="px-1 text-sm font-semibold text-[var(--text-primary)]">
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

          <div className="overflow-hidden rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] shadow-[0_20px_58px_-34px_color-mix(in_srgb,var(--accent)_34%,transparent)]">
            <div className="flex flex-col gap-1 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Ledger table
                </p>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Recorded payment details
                </h2>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{rangeText}</p>
            </div>
            <div className="overflow-x-auto">
            <table
              data-testid="payments-ledger-table"
              aria-label="Monthly payment ledger"
              className="min-w-full border-collapse text-left text-sm"
            >
              <thead>
                <tr className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)]">
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Paid on
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Amount
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Resident
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Billing month
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Notes
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Recorded by
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:color-mix(in_srgb,var(--line-subtle)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_84%,transparent)]">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center"
                    >
                      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_74%,transparent)] px-6 py-7">
                        <p className="font-semibold text-[var(--text-primary)]">
                          No recorded monthly payments for this home yet.
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
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
                      className="transition-colors hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_76%,transparent)]"
                    >
                      <td className="px-5 py-4 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                        {row.paidOn}
                      </td>
                      <td className="px-5 py-4 font-semibold tabular-nums text-[var(--text-primary)]">
                        {formatMinorAsCurrency(
                          row.amountMinor,
                          defaultCurrencyCode,
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/dashboard/homes/${selectedHomeId}/residents/${row.residentId}?tab=billing`}
                          className="font-semibold text-[var(--accent-strong)] underline decoration-[color:color-mix(in_srgb,var(--accent)_36%,transparent)] underline-offset-4 transition hover:text-[var(--accent)]"
                        >
                          {row.residentFullName}
                        </Link>
                      </td>
                      <td className="px-5 py-4 capitalize text-[var(--text-primary)]">
                        <span className="rounded-full border border-[color:color-mix(in_srgb,var(--line-strong)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                          {row.residentStatus === "active" ? "Active" : "Departed"}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                        {row.billingMonth}
                      </td>
                      <td className="max-w-[18rem] px-5 py-4 text-[var(--text-secondary)]">
                        {row.notes?.trim() ? row.notes : "—"}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
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
