"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { buildDashboardHomePaymentsPath } from "@/lib/billing/dashboardHomePaymentsPath";
import type { HomeAccountPaymentLedgerRow } from "@/lib/billing/homeAccounts";
import type { DashboardHomeOption } from "@/lib/dashboard/charts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";

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

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
  } catch {
    // ignore
  }
  return "Request failed.";
}

export function HomeAccountPaymentsLedgerSection({
  homes,
  selectedHomeId,
  defaultCurrencyCode,
  ledger,
}: Props) {
  const router = useRouter();
  const { rows, totalCount, page, pageSize } = ledger;
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [amountMinor, setAmountMinor] = useState("");
  const [receivedOn, setReceivedOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState("transfer");
  const [externalReference, setExternalReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [homeDraft, setHomeDraft] = useState(selectedHomeId);
  const [isApplyingFilters, startApplyingFilters] = useTransition();

  useEffect(() => {
    if (!paymentModalOpen) return;
    setAmountMinor("");
    setReceivedOn(new Date().toISOString().slice(0, 10));
    setMethod("transfer");
    setExternalReference("");
    setNotes("");
    setSubmitError(null);
  }, [paymentModalOpen]);
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

  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const canPrev = page > 1;
  const canNext = page * pageSize < totalCount;
  const selectedHomeName =
    homes.find((home) => home.homeId === selectedHomeId)?.homeName ?? "Selected home";
  const visibleAmountMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
  const rangeText =
    totalCount === 0 ? "Showing 0 of 0" : `Showing ${from}–${to} of ${totalCount}`;
  const hasFilterChanges = homeDraft !== selectedHomeId;
  const isApplyDisabled = !homeDraft || !hasFilterChanges || isApplyingFilters;

  async function handleCreatePaymentSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedHomeId) {
      setSubmitError("Select a home first.");
      return;
    }
    const parsedAmount = Number.parseInt(amountMinor, 10);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setSubmitError("Amount must be a positive whole number in minor units.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn.trim())) {
      setSubmitError("Received date must be YYYY-MM-DD.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/billing-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor: parsedAmount,
          receivedOn: receivedOn.trim(),
          method,
          externalReference:
            externalReference.trim() === "" ? null : externalReference.trim(),
          notes: notes.trim() === "" ? null : notes.trim(),
        }),
      });
      if (!res.ok) {
        setSubmitError(await parseError(res));
        return;
      }
      setPaymentModalOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section
        data-testid="home-payments-ledger-filters"
        className="village-card village-reveal village-reveal-delay-1 relative z-20 rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-5 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-6"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,20rem)_auto_auto] lg:items-end">
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
          <button
            type="button"
            className="h-10 w-full rounded-xl border border-[color:color-mix(in_srgb,var(--accent-strong)_72%,transparent)] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] disabled:bg-[color:color-mix(in_srgb,var(--bg-muted)_84%,transparent)] disabled:text-[var(--text-muted)] lg:w-auto"
            onClick={() => setPaymentModalOpen(true)}
            disabled={!selectedHomeId}
          >
            Create payment
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-4 text-sm text-[var(--text-secondary)]">
          <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-3 py-1.5 font-medium text-[var(--text-primary)]">
            {selectedHomeName}
          </span>
          <span data-testid="home-payments-ledger-range">{rangeText}</span>
          {selectedHomeId ? (
            <Link
              href={`/dashboard/homes/${encodeURIComponent(selectedHomeId)}/ledger`}
              className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--accent-strong)] underline-offset-4 transition hover:text-[var(--accent)]"
            >
              Home operating ledger
            </Link>
          ) : null}
        </div>
      </section>

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

          <div className="flex flex-col gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_78%,transparent)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="px-1 text-sm font-semibold text-[var(--text-primary)]">
              Home account payments
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="village-btn-secondary px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canPrev}
                onClick={() => {
                  router.push(
                    buildDashboardHomePaymentsPath(selectedHomeId, page - 1, pageSize),
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
                    buildDashboardHomePaymentsPath(selectedHomeId, page + 1, pageSize),
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
                  Home operating account receipts
                </h2>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{rangeText}</p>
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
                            Post a receipt with &ldquo;Create payment&rdquo; to build the history here,
                            or open the home&rsquo;s operating ledger for full detail.
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
                        <td className="px-5 py-4 capitalize text-[var(--text-primary)]">
                          <span className="rounded-full border border-[color:color-mix(in_srgb,var(--line-strong)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
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
      {paymentModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                onClick={() => {
                  if (!submitting) {
                    setPaymentModalOpen(false);
                  }
                }}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Create home account payment"
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="text-xl font-semibold tracking-tight text-pine-2">
                            Create payment
                          </h2>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            Record a receipt against this home&rsquo;s operating billing account.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color:color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5"
                          onClick={() => setPaymentModalOpen(false)}
                          disabled={submitting}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <form
                      className="grid gap-5 p-5 sm:p-6"
                      onSubmit={(e) => void handleCreatePaymentSubmit(e)}
                    >
                      {submitError ? (
                        <p className="village-alert-error text-sm">{submitError}</p>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Amount (minor units)</span>
                          <input
                            className="village-input"
                            type="number"
                            min={1}
                            step={1}
                            value={amountMinor}
                            onChange={(e) => setAmountMinor(e.target.value)}
                            placeholder="e.g. 150000"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Received on</span>
                          <input
                            className="village-input"
                            type="date"
                            value={receivedOn}
                            onChange={(e) => setReceivedOn(e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Method</span>
                          <select
                            className="village-input"
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                          >
                            <option value="cash">Cash</option>
                            <option value="transfer">Bank transfer</option>
                            <option value="card">Card</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">External reference</span>
                          <input
                            className="village-input"
                            value={externalReference}
                            onChange={(e) => setExternalReference(e.target.value)}
                            placeholder="Bank reference / receipt #"
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="village-field-label">Notes</span>
                        <textarea
                          className="village-input min-h-[72px]"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </label>
                      <button
                        type="submit"
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-[color-mix(in_srgb,#c2410c_78%,transparent)] bg-gradient-to-br from-[#fdba74] to-[#ea580c] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,#fef3c7_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,#c2410c_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100"
                        disabled={submitting}
                      >
                        {submitting ? "Saving…" : "Post payment"}
                      </button>
                    </form>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
