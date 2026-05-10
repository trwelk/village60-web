"use client";

import { buildDashboardLedgerPath } from "@/lib/billing/dashboardLedgerPath";
import { utcYearToDatePostedDateRange } from "@/lib/billing/postedDateRange";
import { formatCents } from "@/lib/money";
import type { ResidentBillingAccountSummary } from "@/lib/billing/paymentsLifecycle";
import { ArrowLeft, PencilLine } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreateInvoiceLineModal, EditInvoiceLineModal } from "../InvoiceModals";

type InvoiceLineItem = {
  id: string;
  category: string;
  description: string;
  amountMinor: number;
  serviceMonth: string | null;
  quantity: number;
};

type InvoiceDetail = {
  id: string;
  accountId: string;
  accountType: "resident" | "home";
  homeId?: string | null;
  invNo?: string | null;
  purchaseOrderId?: string | null;
  status: string;
  issuedOn: string | null;
  totalMinorSnapshot: number | null;
  monthlyFeeAmountMinor: number | null;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
  lineItems: InvoiceLineItem[];
};

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string") return err;
    }
  } catch {
    // ignore
  }
  return "Request failed.";
}

function formatServiceMonthLabel(month: string | null): string {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return "—";
  const parts = month.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return month;
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

type Props = {
  homeId: string;
  homeName: string;
  invoiceId: string;
  defaultCurrencyCode: string;
  accounts: ResidentBillingAccountSummary[];
};

export function InvoiceDetailClient({
  homeId,
  homeName,
  invoiceId,
  defaultCurrencyCode,
  accounts,
}: Props) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<InvoiceLineItem | null>(null);

  const accountLabel = useMemo(() => {
    if (!invoice) return null;
    const accountType = invoice.accountType ?? "resident";
    if (accountType === "home") {
      return homeName;
    }
    return (
      accounts.find((a) => a.accountId === invoice.accountId)?.fullName ?? "Unknown resident"
    );
  }, [accounts, homeName, invoice]);

  const invoiceHeading = useMemo(() => {
    if (!invoice) return "Invoice";
    const n = invoice.invNo?.trim();
    if (n) return n;
    return invoice.status === "draft" ? "Draft invoice" : "Invoice";
  }, [invoice]);
  const ledgerHref = useMemo(() => {
    if (!invoice) {
      return "/dashboard/ledger";
    }
    const atMs = Date.now();
    const ytd = utcYearToDatePostedDateRange(atMs);
    const scopeHomeId = invoice.homeId ?? homeId;
    const accountType = invoice.accountType ?? "resident";
    if (accountType === "home") {
      return buildDashboardLedgerPath(
        scopeHomeId,
        ytd.postedFrom,
        ytd.postedTo,
        ytd.postedFrom,
        ytd.postedTo,
        { accountType: "home" },
      );
    }
    const residentId =
      accounts.find((a) => a.accountId === invoice.accountId)?.residentId ?? null;
    return buildDashboardLedgerPath(
      scopeHomeId,
      ytd.postedFrom,
      ytd.postedTo,
      ytd.postedFrom,
      ytd.postedTo,
      { accountType: "resident", residentId },
    );
  }, [accounts, homeId, invoice]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/homes/${homeId}/invoices/${invoiceId}`);
      if (!res.ok) {
        setError(await parseError(res));
        setInvoice(null);
        return;
      }
      const json = (await res.json()) as { invoice?: InvoiceDetail };
      if (!json.invoice || !Array.isArray(json.invoice.lineItems)) {
        setError("Invoice not found.");
        setInvoice(null);
        return;
      }
      setInvoice(json.invoice);
    } finally {
      setLoading(false);
    }
  }, [homeId, invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDraftEdits() {
    if (!invoice || invoice.status !== "draft") return;
    setSaveBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/homes/${homeId}/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuedOn: invoice.issuedOn,
          lineItems: invoice.lineItems.map((line) => ({
            id: line.id,
            category: line.category,
            description: line.description,
            amountMinor: line.amountMinor,
            serviceMonth: line.serviceMonth,
          })),
        }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      await load();
    } finally {
      setSaveBusy(false);
    }
  }

  async function finalizeDraft() {
    if (!invoice) return;
    setFinalizeBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/homes/${homeId}/invoices/${invoice.id}/finalize`, {
        method: "POST",
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      await load();
    } finally {
      setFinalizeBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-8 text-ink">
      <div className="village-reveal flex flex-wrap items-center gap-2 text-sm text-ink/75">
        <Link
          href={`/dashboard/invoices?homeId=${encodeURIComponent(homeId)}`}
          className="inline-flex items-center gap-1 font-semibold text-pine underline decoration-terracotta/35 underline-offset-[5px] transition hover:text-terracotta hover:decoration-terracotta/60"
        >
          <ArrowLeft size={14} aria-hidden />
          Back to invoices
        </Link>
        <span className="text-ink/30" aria-hidden>
          /
        </span>
        <span className="font-medium text-ink/85">{homeName}</span>
      </div>

      {error ? (
        <p className="village-alert-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading invoice…</p>
      ) : !invoice ? null : (
        <>
          <section className="village-card village-reveal village-reveal-delay-1 overflow-hidden p-0">
            <div className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_14%,var(--bg-elevated)_86%)] px-6 py-6 sm:px-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="village-kicker text-xs">Billing</p>
                  <h1 className="mt-2 font-display text-3xl font-normal tracking-tight text-pine-2">
                    {invoiceHeading}
                  </h1>
                  {accountLabel ? (
                    <div className="mt-4 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_55%,transparent)] pt-4">
                      <p className="village-kicker text-xs">Account</p>
                      <p className="mt-1.5 font-display text-xl font-normal tracking-tight text-pine-2/95">
                        {accountLabel}
                      </p>
                    </div>
                  ) : null}
                </div>
                <Link href={ledgerHref} className="village-btn-primary px-4 py-2 text-sm">
                  Payments
                </Link>
              </div>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="font-medium text-[var(--text-secondary)]">Status</dt>
                    <dd className="font-semibold uppercase tracking-wide text-[var(--text-primary)]">
                      {invoice.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--text-secondary)]">Invoice date</dt>
                    <dd className="text-[var(--text-primary)]">
                      {invoice.status === "draft" ? (
                        <input
                          className="village-input mt-1 max-w-xs"
                          type="date"
                          value={invoice.issuedOn ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setInvoice((prev) => {
                              if (!prev) return prev;
                              if (v === "") {
                                return { ...prev, issuedOn: null };
                              }
                              if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                                return prev;
                              }
                              return {
                                ...prev,
                                issuedOn: v,
                              };
                            });
                          }}
                        />
                      ) : (
                        invoice.issuedOn ?? "—"
                      )}
                    </dd>
                  </div>
                </dl>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="font-medium text-[var(--text-secondary)]">Invoice total</dt>
                    <dd className="text-lg font-semibold text-[var(--text-primary)]">
                      {invoice.totalMinorSnapshot != null
                        ? formatCents(invoice.totalMinorSnapshot, defaultCurrencyCode)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--text-secondary)]">Updated</dt>
                    <dd className="tabular-nums text-[var(--text-primary)]">
                      {new Date(invoice.updatedAtUtcMs).toLocaleString()}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <section className="village-panel-card overflow-hidden">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_18%,var(--bg-elevated)_82%)] px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Invoice lines</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {invoice.status === "draft"
                    ? "Add lines or edit them in place with Edit. Save saves the invoice date and lines on this draft."
                    : "Posted invoice lines are read-only."}
                </p>
              </div>
              <button
                type="button"
                className="village-btn-primary shrink-0 px-4 py-2 text-sm"
                onClick={() => setLineModalOpen(true)}
                disabled={invoice.status !== "draft"}
              >
                Add line
              </button>
            </header>

            <div className="px-5 py-6 sm:px-6">
              {invoice.lineItems.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">No lines yet. Use Add line to create one.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-left text-[var(--text-secondary)]">
                        <th className="px-5 py-3 font-medium sm:px-6">Category</th>
                        <th className="px-5 py-3 font-medium">Description</th>
                        <th className="whitespace-nowrap px-5 py-3 font-medium">Service month</th>
                        <th className="whitespace-nowrap px-5 py-3 text-right font-medium">Amount</th>
                        {invoice.status === "draft" ? (
                          <th className="px-5 py-3 text-right font-medium sm:px-6">Actions</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lineItems.map((line) => (
                        <tr key={line.id} className="border-b border-[var(--line)]/85 align-middle">
                          <td className="px-5 py-2.5 font-mono text-xs text-[var(--text-secondary)] sm:px-6">
                            {line.category}
                          </td>
                          <td
                            className="max-w-[10rem] px-5 py-2.5 font-medium text-[var(--text-primary)] sm:max-w-md"
                            title={line.description.trim() === "" ? undefined : line.description}
                          >
                            <span className="line-clamp-2">{line.description.trim() || "—"}</span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-[var(--text-secondary)]">
                            {formatServiceMonthLabel(line.serviceMonth)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                            {formatCents(line.amountMinor, defaultCurrencyCode)}
                          </td>
                          {invoice.status === "draft" ? (
                            <td className="px-5 py-2 text-right sm:px-6">
                              <button
                                type="button"
                                className="village-button inline-flex items-center gap-1.5 border-[var(--line)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                onClick={() => setEditingLine(line)}
                              >
                                <PencilLine size={14} aria-hidden />
                                Edit
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {invoice.status === "draft" ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="village-btn-secondary px-4 py-2 text-sm"
                    disabled={saveBusy}
                    onClick={() => void saveDraftEdits()}
                  >
                    {saveBusy ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    className="village-btn-primary px-4 py-2 text-sm"
                    disabled={finalizeBusy}
                    onClick={() => void finalizeDraft()}
                  >
                    {finalizeBusy ? "Finalizing…" : "Finalize invoice"}
                  </button>
                </div>
              ) : (
                <p className="mt-6 text-sm text-[var(--text-secondary)]">This invoice has been finalized.</p>
              )}
            </div>
          </section>

          <CreateInvoiceLineModal
            open={lineModalOpen}
            homeId={homeId}
            invoiceId={invoiceId}
            currencyCode={defaultCurrencyCode}
            invoiceStatus={invoice.status}
            monthlyFeeAmountMinor={invoice.monthlyFeeAmountMinor}
            onClose={() => setLineModalOpen(false)}
            onAdded={() => void load()}
          />
          <EditInvoiceLineModal
            open={editingLine != null}
            line={editingLine}
            homeId={homeId}
            invoiceId={invoiceId}
            currencyCode={defaultCurrencyCode}
            invoiceStatus={invoice.status}
            monthlyFeeAmountMinor={invoice.monthlyFeeAmountMinor}
            onClose={() => setEditingLine(null)}
            onSaved={() => void load()}
          />
        </>
      )}
    </main>
  );
}
