"use client";

import { formatCents } from "@/lib/money";
import type { ResidentBillingAccountSummary } from "@/lib/billing/paymentsLifecycle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreateDraftInvoiceModal } from "./InvoiceModals";

export type InvoiceListItem = {
  id: string;
  accountId: string;
  status: string;
  billingPeriod: string | null;
  issuedOn: string | null;
  totalMinorSnapshot: number | null;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
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

function invoiceDetailHref(homeId: string, invoiceId: string): string {
  return `/dashboard/invoices/${invoiceId}?homeId=${encodeURIComponent(homeId)}`;
}

type Props = {
  homeId: string;
  homeName: string;
  defaultCurrencyCode: string;
  accounts: ResidentBillingAccountSummary[];
};

export function InvoicesListClient({
  homeId,
  homeName,
  defaultCurrencyCode,
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
              {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
            </p>
          </div>
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

        {!loading && invoices.length === 0 ? (
          <div className="px-5 py-10 text-center sm:px-6">
            <p className="text-base font-medium text-[var(--text-primary)]">No invoices yet.</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Use{" "}
              <span className="font-semibold text-[var(--text-primary)]">New invoice</span> to start a
              resident draft.
            </p>
          </div>
        ) : null}

        {invoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[var(--text-secondary)]">
                  <th className="px-5 py-3 font-medium sm:px-6">Resident</th>
                  <th className="px-5 py-3 font-medium">Billing period</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium text-right sm:px-6">Issued</th>
                  <th className="px-5 py-3 font-medium text-right sm:px-6">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const residentName = accountToResidentName.get(invoice.accountId) ?? "Resident";
                  const totalCell =
                    invoice.totalMinorSnapshot != null ? (
                      formatCents(invoice.totalMinorSnapshot, defaultCurrencyCode)
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    );

                  return (
                    <tr key={invoice.id} className="border-b border-[var(--line)]/85 align-top">
                      <td className="px-5 py-3 font-medium text-[var(--text-primary)] sm:px-6">
                        {residentName}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">
                        {invoice.billingPeriod ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                        {totalCell}
                      </td>
                      <td className="px-5 py-3 text-right text-[var(--text-secondary)] sm:px-6">
                        {invoice.issuedOn ? (
                          <span className="tabular-nums">{invoice.issuedOn}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right sm:px-6">
                        <Link
                          href={invoiceDetailHref(homeId, invoice.id)}
                          className="village-button inline-flex"
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
        accounts={accounts}
        onClose={() => setCreateOpen(false)}
        onCreated={(invoiceId) => {
          void loadInvoices();
          router.push(invoiceDetailHref(homeId, invoiceId));
        }}
      />
    </div>
  );
}
