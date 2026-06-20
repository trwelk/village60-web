"use client";

/* eslint-disable react-hooks/set-state-in-effect -- intentional sync Effects */

import { VillageList, VillageListPagination } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  buildDashboardPaymentsPath,
  type DashboardPaymentsAccountType,
} from "@/lib/billing/dashboardPaymentsPath";
import type { HomeAccountPaymentLedgerRow } from "@/lib/billing/homeAccounts";
import type { HomeMonthlyPaymentLedgerRow } from "@/lib/billing/residentCharges";
import type { DashboardHomeOption } from "@/lib/dashboard/charts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

export type HomePaymentsLedgerPayload =
  | {
      kind: "resident";
      rows: HomeMonthlyPaymentLedgerRow[];
      totalCount: number;
      page: number;
      pageSize: number;
    }
  | {
      kind: "home";
      rows: HomeAccountPaymentLedgerRow[];
      totalCount: number;
      page: number;
      pageSize: number;
    };

type Props = {
  homes: DashboardHomeOption[];
  selectedHomeId: string;
  selectedAccountType: DashboardPaymentsAccountType;
  selectedResidentId: string | null;
  residentOptions: {
    residentId: string;
    residentFullName: string;
    residentStatus: string;
  }[];
  defaultCurrencyCode: string;
  ledger: HomePaymentsLedgerPayload;
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
  selectedAccountType,
  selectedResidentId,
  residentOptions,
  defaultCurrencyCode,
  ledger,
}: Props) {
  const router = useRouter();
  const { rows, totalCount, page, pageSize } = ledger;
  const [accountTypeDraft, setAccountTypeDraft] =
    useState<DashboardPaymentsAccountType>(selectedAccountType);
  const [homeDraft, setHomeDraft] = useState(selectedHomeId);
  const [residentDraft, setResidentDraft] = useState(selectedResidentId ?? "");
  const [isApplyingFilters, startApplyingFilters] = useTransition();

  const accountTypeOptions = useMemo(
    () =>
      [
        { value: "resident" as const, label: "Resident" },
        { value: "home" as const, label: "Home" },
      ] as const,
    [],
  );

  useEffect(() => {
    setAccountTypeDraft(selectedAccountType);
    setHomeDraft(selectedHomeId);
    setResidentDraft(selectedResidentId ?? "");
  }, [selectedAccountType, selectedHomeId, selectedResidentId]);

  if (homes.length === 0) {
    return (
      <p className="village-muted mt-4">
        No active retirement homes yet. Payment history appears after homes exist.
      </p>
    );
  }

  const selectedHomeName =
    homes.find((home) => home.homeId === selectedHomeId)?.homeName ??
    "Selected home";
  const visibleAmountMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
  const uniqueResidentCount =
    ledger.kind === "resident"
      ? new Set(
          (rows as HomeMonthlyPaymentLedgerRow[]).map((row) => row.residentId),
        ).size
      : rows.length > 0
        ? 1
        : 0;
  const hasFilterChanges =
    accountTypeDraft !== selectedAccountType ||
    homeDraft !== selectedHomeId ||
    (accountTypeDraft === "resident" &&
      residentDraft !== (selectedResidentId ?? ""));
  const isApplyDisabled = !homeDraft || !hasFilterChanges || isApplyingFilters;

  const paymentsLedgerActiveFilterCount =
    (selectedResidentId ? 1 : 0) + (selectedAccountType === "home" ? 1 : 0);

  return (
    <>
      <VillageList
        rootElement="div"
        wrapBody="none"
        listTitle={null}
        filtersCollapsible
        activeFilterCount={paymentsLedgerActiveFilterCount}
        loading={isApplyingFilters}
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
            data-testid="payments-ledger-filters"
          >
        <div
          className={
            accountTypeDraft === "resident"
              ? "grid gap-4 lg:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1fr)_minmax(14rem,1fr)_auto] lg:items-end"
              : "grid gap-4 lg:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1fr)_auto] lg:items-end"
          }
        >
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            <span className="village-label">Account type</span>
            <VillageSelect
              value={accountTypeDraft}
              onChange={(v) => {
                const next = v === "home" ? "home" : "resident";
                setAccountTypeDraft(next);
                if (next === "home") {
                  setResidentDraft("");
                }
              }}
              options={accountTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            <span className="village-label">Home</span>
            <VillageSelect
              id="payments-ledger-home"
              value={homeDraft}
              onChange={(id) => {
                setHomeDraft(id);
                setResidentDraft("");
              }}
              options={homes.map((h) => ({
                value: h.homeId,
                label: h.homeName,
              }))}
            />
          </label>
          {accountTypeDraft === "resident" ? (
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              <span className="village-label">Resident (optional)</span>
              <VillageSelect
                id="payments-ledger-resident"
                value={residentDraft}
                onChange={setResidentDraft}
                options={[
                  { value: "", label: "All residents" },
                  ...residentOptions.map((resident) => ({
                    value: resident.residentId,
                    label:
                      resident.residentStatus === "active"
                        ? resident.residentFullName
                        : `${resident.residentFullName} (Departed)`,
                  })),
                ]}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="h-10 w-full rounded-xl border border-[color:color-mix(in_srgb,var(--accent-strong)_72%,transparent)] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] disabled:bg-[color:color-mix(in_srgb,var(--bg-muted)_84%,transparent)] disabled:text-[var(--text-muted)] lg:w-auto"
            disabled={isApplyDisabled}
            aria-busy={isApplyingFilters}
            onClick={() => {
              if (isApplyDisabled) return;
              const nextResidentId =
                accountTypeDraft === "resident" && residentDraft === ""
                  ? null
                  : accountTypeDraft === "resident"
                    ? residentDraft
                    : null;
              startApplyingFilters(() => {
                router.push(
                  buildDashboardPaymentsPath(homeDraft, 1, pageSize, {
                    accountType: accountTypeDraft,
                    residentId: nextResidentId,
                  }),
                );
              });
            }}
          >
            {isApplyingFilters ? "Applying..." : "Apply filters"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-4 text-sm text-[var(--text-secondary)]">
          <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-3 py-1.5 font-medium text-[var(--text-primary)]">
            {selectedAccountType === "home" ? "Home" : "Resident"} ·{" "}
            {selectedHomeName}
          </span>
          {selectedAccountType === "resident" ? (
            selectedResidentId ? (
              <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                Filtered to one resident
              </span>
            ) : (
              <span>Showing all residents in this home.</span>
            )
          ) : (
            <span>Shows operating (home) payments for the selected facility.</span>
          )}
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
                {ledger.kind === "resident" ? "Residents" : "Account"}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[2.1rem]">
                {uniqueResidentCount}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {ledger.kind === "resident"
                  ? "represented on this page"
                  : rows.length > 0
                    ? "home operating ledger"
                    : "no rows on this page"}
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
              Payment ledger
            </p>
            <VillageListPagination
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              rangeTestId="payments-ledger-range"
              onPrevious={() => {
                router.push(
                  buildDashboardPaymentsPath(
                    selectedHomeId,
                    page - 1,
                    pageSize,
                    {
                      accountType: selectedAccountType,
                      residentId: selectedResidentId,
                    },
                  ),
                );
              }}
              onNext={() => {
                router.push(
                  buildDashboardPaymentsPath(
                    selectedHomeId,
                    page + 1,
                    pageSize,
                    {
                      accountType: selectedAccountType,
                      residentId: selectedResidentId,
                    },
                  ),
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
                  Recorded payment details
                </h2>
              </div>
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
                    {ledger.kind === "home" ? "Account" : "Resident"}
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
                          {ledger.kind === "home"
                            ? "No recorded home operating payments yet."
                            : "No recorded monthly payments for this home yet."}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                          {ledger.kind === "home"
                            ? "Payments to the facility operating account appear here after invoices are marked paid."
                            : "Invoice payments appear here after invoices are marked paid from invoice detail or monthly collection."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : ledger.kind === "home" ? (
                  (rows as HomeAccountPaymentLedgerRow[]).map((row) => (
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
                      <td className="px-5 py-4 font-semibold text-[var(--text-primary)]">
                        Home operating
                      </td>
                      <td className="px-5 py-4 capitalize text-[var(--text-primary)]">
                        <span className="rounded-full border border-[color:color-mix(in_srgb,var(--line-strong)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                          Operating
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                        {row.billingMonth}
                      </td>
                      <td className="max-w-[18rem] px-5 py-4 text-[var(--text-secondary)]">
                        {row.notes?.trim() ? row.notes : "—"}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {row.recordedByEmail ?? "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  (rows as HomeMonthlyPaymentLedgerRow[]).map((row) => (
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
                          href={`/dashboard/ledger?homeId=${encodeURIComponent(selectedHomeId)}&accountType=resident&resident=${encodeURIComponent(row.residentId)}`}
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
                        {row.recordedByEmail ?? "—"}
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
