"use client";

import type { InvoiceListItem } from "@/lib/billing/invoiceLifecycle";
import { formatCents } from "@/lib/money";
import type { ResidentBillingAccountSummary } from "@/lib/billing/paymentsLifecycle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreateDraftInvoiceModal } from "./InvoiceModals";

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

function invoiceDetailHref(homeId: string, invoiceId: string): string {
  return `/dashboard/invoices/${invoiceId}?homeId=${encodeURIComponent(homeId)}`;
}

function invoiceDateLabel(issuedOn: string | null): string {
  if (issuedOn && /^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) {
    return issuedOn;
  }
  return "—";
}

function invoiceStatusBadgeClass(status: string): string {
  const key = status.trim().toLowerCase();
  const base =
    "rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide";
  switch (key) {
    case "paid":
      return `${base} border-[color:color-mix(in_srgb,var(--success)_44%,var(--line-strong)_56%)] bg-[color:color-mix(in_srgb,var(--partner-green)_20%,var(--bg-elevated)_80%)] text-[var(--success)]`;
    case "finalized":
      return `${base} border-[color:color-mix(in_srgb,var(--accent)_40%,var(--line-strong)_60%)] bg-[color:color-mix(in_srgb,var(--accent)_11%,var(--bg-elevated)_89%)] text-[color:color-mix(in_srgb,var(--accent-strong)_90%,var(--text-primary)_10%)]`;
    case "draft":
      return `${base} border-[color:color-mix(in_srgb,var(--warning)_48%,var(--line-strong)_52%)] bg-[color:color-mix(in_srgb,var(--warning)_16%,var(--bg-elevated)_84%)] text-[color:color-mix(in_srgb,var(--warning)_95%,var(--text-primary)_5%)]`;
    default:
      return `${base} border-[var(--line)] bg-[color:color-mix(in_srgb,var(--bg-muted)_50%,transparent)] text-[var(--text-secondary)]`;
  }
}

type HomePickerOption = { homeId: string; homeName: string };

type Props = {
  homeId: string;
  homeName: string;
  homes: HomePickerOption[];
  defaultCurrencyCode: string;
  accountTypeFilter: "resident" | "home";
  selectedResidentId: string;
  accounts: ResidentBillingAccountSummary[];
};

export function InvoicesListClient({
  homeId,
  homeName,
  homes,
  defaultCurrencyCode,
  accountTypeFilter,
  selectedResidentId,
  accounts,
}: Props) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const accountToResidentName = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(account.accountId, account.fullName);
    }
    return map;
  }, [accounts]);
  const residentToAccountIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const account of accounts) {
      const existing = map.get(account.residentId) ?? new Set<string>();
      existing.add(account.accountId);
      map.set(account.residentId, existing);
    }
    return map;
  }, [accounts]);
  const filteredInvoices = useMemo(() => {
    const byOwner = invoices.filter((inv) => inv.accountType === accountTypeFilter);
    if (accountTypeFilter !== "resident" || !selectedResidentId) {
      return byOwner;
    }
    const accountIds = residentToAccountIds.get(selectedResidentId);
    if (!accountIds || accountIds.size === 0) {
      return [];
    }
    return byOwner.filter((invoice) => accountIds.has(invoice.accountId));
  }, [invoices, residentToAccountIds, selectedResidentId, accountTypeFilter]);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/homes/${homeId}/invoices`, { cache: "no-store" });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const json = (await res.json()) as { invoices?: InvoiceListItem[] };
      setInvoices(Array.isArray(json.invoices) ? json.invoices : []);
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  return (
    <div className="flex flex-col gap-6">
      {error && !createOpen ? <p className="village-alert-error">{error}</p> : null}

      <section className="village-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold">Invoices · {homeName}</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {filteredInvoices.length} invoice{filteredInvoices.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 sm:gap-3 sm:flex-initial sm:justify-end">
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
                onClick={() => {
                  setError(null);
                  setCreateOpen(true);
                }}
              >
                New invoice
              </button>
            </div>
            <button
              type="button"
              className="village-btn-secondary shrink-0"
              onClick={() => {
                void loadInvoices();
                router.refresh();
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {!loading && filteredInvoices.length === 0 ? (
          <div className="px-5 py-10 text-center sm:px-6">
            {accountTypeFilter === "resident" && selectedResidentId ? (
              <>
                <p className="text-base font-medium text-[var(--text-primary)]">
                  No invoices for this resident.
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Switch resident filter to view invoices for others in this home.
                </p>
              </>
            ) : accountTypeFilter === "home" ? (
              <>
                <p className="text-base font-medium text-[var(--text-primary)]">
                  No home operating invoices yet.
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Finalize a draft tied to this facility&apos;s home account to see it here.
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-[var(--text-primary)]">No invoices yet.</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Use{" "}
                  <span className="font-semibold text-[var(--text-primary)]">New invoice</span> to
                  start a resident draft.
                </p>
              </>
            )}
          </div>
        ) : null}

        {filteredInvoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[var(--text-secondary)]">
                  <th className="px-5 py-3 font-medium sm:px-6">Invoice no.</th>
                  <th className="px-5 py-3 font-medium">Account</th>
                  <th className="px-5 py-3 font-medium">Invoice date</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium text-right sm:px-6">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => {
                  const accountName =
                    invoice.accountType === "home"
                      ? homeName
                      : (accountToResidentName.get(invoice.accountId) ?? "Unknown resident");
                  const totalCell =
                    invoice.totalMinorSnapshot != null ? (
                      formatCents(invoice.totalMinorSnapshot, defaultCurrencyCode)
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    );

                  return (
                    <tr key={invoice.id} className="border-b border-[var(--line)]/85 align-middle">
                      <td className="px-5 py-3 font-mono text-sm tabular-nums text-[var(--text-primary)] sm:px-6">
                        {invoice.invNo?.trim() ? invoice.invNo : "—"}
                      </td>
                      <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                        {accountName}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-[var(--text-secondary)]">
                        {invoiceDateLabel(invoice.issuedOn)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={invoiceStatusBadgeClass(invoice.status)}>{invoice.status}</span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                        {totalCell}
                      </td>
                      <td className="px-5 py-3 text-right sm:px-6">
                        <Link
                          href={invoiceDetailHref(homeId, invoice.id)}
                          className="village-button village-button--compact"
                        >
                          Open invoice
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <CreateDraftInvoiceModal
        open={createOpen}
        homeId={homeId}
        homes={homes}
        accountTypeFilter={accountTypeFilter}
        accounts={accounts}
        onClose={() => setCreateOpen(false)}
        onCreated={(invoiceId, invoiceHomeId) => {
          void loadInvoices();
          router.push(invoiceDetailHref(invoiceHomeId, invoiceId));
        }}
      />
    </div>
  );
}
