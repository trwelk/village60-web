"use client";

import { VillageSelect } from "@/components/VillageSelect";
import {
  buildDashboardExpenseDetailPath,
  buildDashboardExpensesPath,
} from "@/lib/billing/dashboardExpensesPath";
import type { DashboardHomeOption } from "@/lib/dashboard/charts";
import type { ExpenseTypeDto } from "@/lib/expenseTypes/service";
import type {
  HomeExpenseLedgerRow,
  HomeExpensesLedgerPaymentFilter,
  HomeExpensesLedgerSummary,
} from "@/lib/homeExpenses/ledgerShared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ExpenseForm, ExpenseModalShell } from "./ExpenseEditorDialog";

type LedgerSlice = {
  rows: HomeExpenseLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeExpensesLedgerSummary;
};

type Props = {
  homes: DashboardHomeOption[];
  selectedHomeId: string;
  defaultCurrencyCode: string;
  expenseTypes: ExpenseTypeDto[];
  ledger: LedgerSlice;
  incurredFrom: string;
  incurredTo: string;
  rangeIsDefaultYtd: boolean;
  paymentStatus: HomeExpensesLedgerPaymentFilter;
  expenseTypeId: string;
};

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

function truncate(s: string | null, max: number): string {
  if (!s) return "—";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function HomeExpensesSection({
  homes,
  selectedHomeId,
  defaultCurrencyCode,
  expenseTypes,
  ledger,
  incurredFrom,
  incurredTo,
  rangeIsDefaultYtd,
  paymentStatus,
  expenseTypeId,
}: Props) {
  const router = useRouter();
  const formId = useId();
  const [rangeDraft, setRangeDraft] = useState({
    from: incurredFrom,
    to: incurredTo,
  });

  useEffect(() => {
    setRangeDraft({ from: incurredFrom, to: incurredTo });
  }, [incurredFrom, incurredTo]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { rows, totalCount, page, pageSize, summary } = ledger;
  const fromIdx = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, totalCount);
  const canPrev = page > 1;
  const canNext = page * pageSize < totalCount;

  const pushPath = (opts: Parameters<typeof buildDashboardExpensesPath>[1]) => {
    router.push(
      buildDashboardExpensesPath(selectedHomeId, {
        incurredFrom: rangeIsDefaultYtd ? undefined : incurredFrom,
        incurredTo: rangeIsDefaultYtd ? undefined : incurredTo,
        paymentStatus,
        expenseTypeId: expenseTypeId || undefined,
        page: ledger.page,
        pageSize: ledger.pageSize,
        ...opts,
      }),
    );
  };

  async function submitExpense(body: Record<string, unknown>) {
    setSaving(true);
    setFormError(null);
    try {
      const url = `/api/homes/${encodeURIComponent(selectedHomeId)}/expenses`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? (await res.text()));
      }
      setCreateModalOpen(false);
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id: string) {
    if (!window.confirm("Delete this expense row? This cannot be undone.")) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(selectedHomeId)}/expenses/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? (await res.text()));
      }
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  if (homes.length === 0) {
    return (
      <p className="village-muted mt-4">
        No active retirement homes yet. Expenses are recorded per home after
        homes exist.
      </p>
    );
  }

  const selectedHomeName =
    homes.find((h) => h.homeId === selectedHomeId)?.homeName ?? "Selected home";

  return (
    <>
      <section
        data-testid="home-expenses-filters"
        className="village-card village-reveal village-reveal-delay-1 relative z-20 rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-5 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,18rem)_minmax(12rem,1fr)_minmax(12rem,1fr)] lg:items-end">
            <div className="flex flex-col gap-2">
              <label htmlFor={`${formId}-home`} className="village-label">
                Home
              </label>
              <VillageSelect
                id={`${formId}-home`}
                value={selectedHomeId}
                onChange={(id) => {
                  router.push(
                    buildDashboardExpensesPath(id, {
                      page: 1,
                      pageSize: ledger.pageSize,
                    }),
                  );
                }}
                options={homes.map((h) => ({
                  value: h.homeId,
                  label: h.homeName,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="village-label">Incurred from</span>
              <input
                type="date"
                className="village-input"
                value={rangeDraft.from}
                onChange={(e) =>
                  setRangeDraft((d) => ({ ...d, from: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="village-label">Incurred to</span>
              <input
                type="date"
                className="village-input"
                value={rangeDraft.to}
                onChange={(e) =>
                  setRangeDraft((d) => ({ ...d, to: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="village-btn village-btn-secondary"
              onClick={() => {
                router.push(
                  buildDashboardExpensesPath(selectedHomeId, {
                    paymentStatus,
                    expenseTypeId: expenseTypeId || undefined,
                    page: 1,
                    pageSize: ledger.pageSize,
                  }),
                );
              }}
            >
              Year to date (UTC)
            </button>
            <button
              type="button"
              className="village-btn village-btn-primary"
              onClick={() => {
                if (!rangeDraft.from || !rangeDraft.to) {
                  window.alert("Choose both start and end dates.");
                  return;
                }
                router.push(
                  buildDashboardExpensesPath(selectedHomeId, {
                    incurredFrom: rangeDraft.from,
                    incurredTo: rangeDraft.to,
                    page: 1,
                    pageSize: ledger.pageSize,
                    paymentStatus,
                    expenseTypeId: expenseTypeId || undefined,
                  }),
                );
              }}
            >
              Apply range
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label htmlFor={`${formId}-pay`} className="village-label">
              Payment
            </label>
            <VillageSelect
              id={`${formId}-pay`}
              value={paymentStatus}
              onChange={(v) => {
                router.push(
                  buildDashboardExpensesPath(selectedHomeId, {
                    incurredFrom: rangeIsDefaultYtd ? undefined : incurredFrom,
                    incurredTo: rangeIsDefaultYtd ? undefined : incurredTo,
                    paymentStatus: v as HomeExpensesLedgerPaymentFilter,
                    expenseTypeId: expenseTypeId || undefined,
                    page: 1,
                    pageSize: ledger.pageSize,
                  }),
                );
              }}
              options={[
                { value: "all", label: "All" },
                { value: "unpaid", label: "Unpaid" },
                { value: "paid", label: "Paid" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${formId}-type`} className="village-label">
              Expense type
            </label>
            <VillageSelect
              id={`${formId}-type`}
              value={expenseTypeId}
              onChange={(tid) => {
                router.push(
                  buildDashboardExpensesPath(selectedHomeId, {
                    incurredFrom: rangeIsDefaultYtd ? undefined : incurredFrom,
                    incurredTo: rangeIsDefaultYtd ? undefined : incurredTo,
                    paymentStatus,
                    expenseTypeId: tid || undefined,
                    page: 1,
                    pageSize: ledger.pageSize,
                  }),
                );
              }}
              options={[
                { value: "", label: "All types" },
                ...expenseTypes.map((t) => ({
                  value: t.id,
                  label: t.name,
                })),
              ]}
            />
          </div>
          <div className="flex flex-col justify-end gap-2 sm:col-span-2 lg:col-span-1">
            <Link
              href="/dashboard/expenses/types"
              className="text-sm font-medium text-[var(--highlight)] underline decoration-[color:color-mix(in_srgb,var(--highlight)_35%,transparent)] underline-offset-[3px]"
            >
              Manage expense types
            </Link>
            {selectedHomeId ? (
              <button
                type="button"
                className="village-btn village-btn-primary w-full sm:w-auto"
                onClick={() => {
                  setFormError(null);
                  setCreateModalOpen(true);
                }}
              >
                Add expense
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-3 py-1.5 font-medium text-[var(--text-primary)]">
            {selectedHomeName}
          </span>
          <span>
            {rangeIsDefaultYtd
              ? "Range: calendar year-to-date (UTC) on incurred date."
              : `Range: ${incurredFrom} → ${incurredTo}.`}
          </span>
        </div>
      </section>

      {selectedHomeId ? (
        <div className="village-reveal village-reveal-delay-2 flex flex-col gap-4">
          <div className="rounded-2xl border border-pine/12 bg-cream/80 p-4 shadow-sm">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/45">
              Filtered total
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-pine-2">
              {formatMinorAsCurrency(summary.grandTotalMinor, defaultCurrencyCode)}
            </p>
            {summary.breakdown.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2 text-sm text-ink/75">
                {summary.breakdown.map((b) => (
                  <li
                    key={b.expenseTypeId}
                    className="rounded-lg border border-pine/10 bg-white/60 px-2.5 py-1"
                  >
                    <span className="font-medium text-ink">{b.name}</span>
                    {": "}
                    {formatMinorAsCurrency(b.totalMinor, defaultCurrencyCode)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink/55">No rows in this view.</p>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_94%,transparent)]">
            <table className="min-w-[56rem] w-full border-collapse text-left text-sm">
              <thead className="bg-[color:color-mix(in_srgb,var(--bg-muted)_88%,transparent)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2.5">Incurred</th>
                  <th className="px-3 py-2.5">Paid</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5">Vendor</th>
                  <th className="px-3 py-2.5">Reference</th>
                  <th className="px-3 py-2.5">Note</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-[var(--text-secondary)]"
                    >
                      No expenses in this range. Add one or widen the dates.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`View expense: ${r.expenseTypeName}, ${formatMinorAsCurrency(r.amountMinor, defaultCurrencyCode)}, incurred ${r.incurredOn}`}
                      className="cursor-pointer border-t border-[color:color-mix(in_srgb,var(--line-subtle)_80%,transparent)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_72%,transparent)] focus-visible:bg-[color:color-mix(in_srgb,var(--bg-muted)_72%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--highlight)]"
                      onClick={() =>
                        router.push(
                          buildDashboardExpenseDetailPath(
                            selectedHomeId,
                            r.id,
                            {
                              incurredFrom: rangeIsDefaultYtd
                                ? undefined
                                : incurredFrom,
                              incurredTo: rangeIsDefaultYtd
                                ? undefined
                                : incurredTo,
                              paymentStatus,
                              expenseTypeId: expenseTypeId || undefined,
                              page: ledger.page,
                              pageSize: ledger.pageSize,
                            },
                          ),
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(
                            buildDashboardExpenseDetailPath(
                              selectedHomeId,
                              r.id,
                              {
                                incurredFrom: rangeIsDefaultYtd
                                  ? undefined
                                  : incurredFrom,
                                incurredTo: rangeIsDefaultYtd
                                  ? undefined
                                  : incurredTo,
                                paymentStatus,
                                expenseTypeId: expenseTypeId || undefined,
                                page: ledger.page,
                                pageSize: ledger.pageSize,
                              },
                            ),
                          );
                        }
                      }}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.incurredOn}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.paidOn ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">{r.expenseTypeName}</td>
                      <td className="px-3 py-2.5 font-medium tabular-nums">
                        {formatMinorAsCurrency(r.amountMinor, defaultCurrencyCode)}
                      </td>
                      <td className="px-3 py-2.5 max-w-[10rem]">
                        {truncate(r.vendor, 40)}
                      </td>
                      <td className="px-3 py-2.5 max-w-[9rem]">
                        {truncate(r.invoiceReference, 32)}
                      </td>
                      <td className="px-3 py-2.5 max-w-[12rem]">
                        {truncate(r.note, 48)}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={deletingId === r.id}
                          className="text-terracotta underline decoration-[color:color-mix(in_srgb,var(--accent)_42%,transparent)] underline-offset-2 disabled:opacity-50"
                          onClick={() => void confirmDelete(r.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
            <span>
              {totalCount === 0
                ? "0 rows"
                : `Showing ${fromIdx}–${toIdx} of ${totalCount}`}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="village-btn village-btn-secondary"
                disabled={!canPrev}
                onClick={() => pushPath({ page: page - 1 })}
              >
                Previous
              </button>
              <button
                type="button"
                className="village-btn village-btn-secondary"
                disabled={!canNext}
                onClick={() => pushPath({ page: page + 1 })}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createModalOpen ? (
        <ExpenseModalShell
          mode="create"
          currencyCode={defaultCurrencyCode}
          closeDisabled={saving}
          onClose={() => !saving && setCreateModalOpen(false)}
        >
          <ExpenseForm
            key="create-expense-form"
            homeId={selectedHomeId}
            expenseTypes={expenseTypes}
            defaultCurrencyCode={defaultCurrencyCode}
            disabled={expenseTypes.length === 0}
            error={formError}
            submitting={saving}
            onAttachmentsChanged={() => router.refresh()}
            onSubmit={(payload) => {
              void submitExpense(payload);
            }}
          />
        </ExpenseModalShell>
      ) : null}
    </>
  );
}
