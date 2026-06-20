"use client";

/* eslint-disable react-hooks/set-state-in-effect -- intentional sync Effects */

import { VillageList, VillageListPagination } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import { buildDashboardHomePaymentsPath } from "@/lib/billing/dashboardHomePaymentsPath";
import type { HomeAccountPaymentLedgerRow } from "@/lib/billing/homeAccounts";
import type { DashboardHomeOption } from "@/lib/dashboard/charts";
import { dashboardLedgerHref } from "@/lib/dashboard/dashboardRoutes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type Props = {
  homes: DashboardHomeOption[];
  selectedHomeId: string;
  defaultCurrencyCode: string;
  ledger: {
    rows: HomeAccountPaymentLedgerRow[];
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

function formatMethodLabel(raw: string): string {
  const m = raw.trim().toLowerCase();
  if (m === "transfer") return "Bank transfer";
  if (m === "cash") return "Cash";
  if (m === "card") return "Card";
  if (m === "other") return "Other";
  return raw;
}

function methodBadgeClass(raw: string): string {
  const m = raw.trim().toLowerCase();
  if (m === "transfer")
    return "rounded-full border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--bg-elevated)_90%)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-strong)]";
  if (m === "cash")
    return "rounded-full border border-[color:color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--success)_12%,var(--bg-elevated)_88%)] px-2.5 py-1 text-xs font-semibold text-[color:color-mix(in_srgb,var(--success)_90%,var(--text-primary)_10%)]";
  if (m === "card")
    return "rounded-full border border-[color:color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--warning)_10%,var(--bg-elevated)_90%)] px-2.5 py-1 text-xs font-semibold text-[color:color-mix(in_srgb,var(--warning)_90%,var(--text-primary)_10%)]";
  return "rounded-full border border-[color:color-mix(in_srgb,var(--line-strong)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]";
}

export function HomeAccountPaymentsLedgerSection({
  homes,
  selectedHomeId,
  defaultCurrencyCode,
  ledger,
}: Props) {
  const router = useRouter();
  const { rows, totalCount, page, pageSize } = ledger;
  const [homeDraft, setHomeDraft] = useState(selectedHomeId);
  const [isApplyingFilters, startApplyingFilters] = useTransition();

  useEffect(() => {
    setHomeDraft(selectedHomeId);
  }, [selectedHomeId]);

  if (homes.length === 0) {
    return (
      <p className="village-muted mt-4">
        No active retirement homes yet. Home account payments appear after homes exist.
      </p>
    );
  }

  const selectedHomeName =
    homes.find((home) => home.homeId === selectedHomeId)?.homeName ?? "Selected home";
  const visibleAmountMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
  const hasFilterChanges = homeDraft !== selectedHomeId;
  const isApplyDisabled = !homeDraft || !hasFilterChanges || isApplyingFilters;

  return (
    <>
      <VillageList
        rootElement="div"
        wrapBody="none"
        listTitle={null}
        loading={isApplyingFilters}
        filtersCollapsible
        toolbar={
          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
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
            data-testid="home-payments-ledger-filters"
          >
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,20rem)_auto] lg:items-end">
          <div className="flex min-w-0 w-full flex-col gap-2">
            <label htmlFor="home-payments-ledger-home" className="village-label">
              Home
            </label>
            <VillageSelect
              id="home-payments-ledger-home"
              value={homeDraft}
              onChange={setHomeDraft}
              options={homes.map((h) => ({
                value: h.homeId,
                label: h.homeName,
              }))}
            />
          </div>
          <button
            type="button"
            className="h-10 w-full rounded-xl border border-[color:color-mix(in_srgb,var(--accent-strong)_72%,transparent)] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] disabled:bg-[color:color-mix(in_srgb,var(--bg-muted)_84%,transparent)] disabled:text-[var(--text-muted)] lg:w-auto"
            disabled={isApplyDisabled}
            aria-busy={isApplyingFilters}
            onClick={() => {
              if (isApplyDisabled) return;
              startApplyingFilters(() => {
                router.push(buildDashboardHomePaymentsPath(homeDraft, 1, pageSize));
              });
            }}
          >
            {isApplyingFilters ? "Applying..." : "Apply"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-4 text-sm text-[var(--text-secondary)]">
          <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-3 py-1.5 font-medium text-[var(--text-primary)]">
            {selectedHomeName}
          </span>
          {selectedHomeId ? (
            <Link
              href={dashboardLedgerHref(selectedHomeId)}
              className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--accent-strong)] underline-offset-4 transition hover:text-[var(--accent)]"
            >
              Home operating ledger
            </Link>
          ) : null}
        </div>
          </div>
        }
      >
      {selectedHomeId ? (
        <div className="village-reveal village-reveal-delay-2 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
              <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                Visible payments
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[2.1rem]">
                {formatMinorAsCurrency(visibleAmountMinor, defaultCurrencyCode)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {rows.length} payment{rows.length === 1 ? "" : "s"} on this page
              </p>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
              <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                Payments on page
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[2.1rem]">
                {rows.length}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                receipts in the current range
              </p>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--danger)_38%,var(--line-strong)_62%)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
              <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                Ledger depth
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--danger)] sm:text-[2.1rem]">
                {totalCount}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                total recorded payment{totalCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
              Home account payments
            </p>
            <VillageListPagination
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              rangeTestId="home-payments-ledger-range"
              onPrevious={() => {
                router.push(
                  buildDashboardHomePaymentsPath(selectedHomeId, page - 1, pageSize),
                );
              }}
              onNext={() => {
                router.push(
                  buildDashboardHomePaymentsPath(selectedHomeId, page + 1, pageSize),
                );
              }}
            />
          </div>

          <div className="overflow-hidden rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] shadow-[0_20px_58px_-34px_color-mix(in_srgb,var(--accent)_34%,transparent)]">
            <div className="flex flex-col gap-1 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Ledger table
                </p>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Home operating account receipts
                </h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table
                data-testid="home-payments-ledger-table"
                aria-label="Home account payment ledger"
                className="min-w-full border-collapse text-left text-sm"
              >
                <thead>
                  <tr className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)]">
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                    >
                      Paid on
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                    >
                      Method
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                    >
                      Billing month
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                    >
                      Notes
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                    >
                      Recorded by
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:color-mix(in_srgb,var(--line-subtle)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_84%,transparent)]">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <div className="mx-auto max-w-md rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_74%,transparent)] px-6 py-7">
                          <p className="font-semibold text-[var(--text-primary)]">
                            No payments recorded for this home operating account yet.
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                            Invoice payments appear here after home expense invoices are marked paid.
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
                          {formatMinorAsCurrency(row.amountMinor, defaultCurrencyCode)}
                        </td>
                        <td className="px-5 py-4 text-[var(--text-primary)]">
                          <span className={methodBadgeClass(row.method)}>
                            {formatMethodLabel(row.method)}
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
      </VillageList>
    </>
  );
}
