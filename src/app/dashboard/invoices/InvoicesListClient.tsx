"use client";

import type { InvoiceListItem } from "@/lib/billing/invoiceLifecycle";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { translateInvoiceStatus } from "@/lib/i18n/invoiceStatus";
import { translateWith } from "@/lib/i18n/messages";
import { formatCents } from "@/lib/money";
import type { ResidentBillingAccountSummary } from "@/lib/billing/paymentsLifecycle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreateDraftInvoiceModal } from "./InvoiceModals";

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string") return err;
    }
  } catch {
    // ignore
  }
  return fallback;
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
  const { t, locale } = useI18n();
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
        setError(await parseError(res, t("common.requestFailed")));
        return;
      }
      const json = (await res.json()) as { invoices?: InvoiceListItem[] };
      setInvoices(Array.isArray(json.invoices) ? json.invoices : []);
    } finally {
      setLoading(false);
    }
  }, [homeId, t]);

  useEffect(() => {
    setInvoices([]);
  }, [homeId]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  return (
    <div className="flex flex-col gap-6">
      {error && !createOpen ? <p className="village-alert-error">{error}</p> : null}

      <section className="village-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">
              <span className="block break-words sm:truncate">
                {translateWith(locale, "invoices.titleWithHome", { homeName })}
              </span>
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {filteredInvoices.length === 1
                ? t("invoices.countOne")
                : translateWith(locale, "invoices.countMany", {
                    count: filteredInvoices.length,
                  })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-stretch sm:self-auto">
            <button
              type="button"
              className="village-btn-primary min-w-0 flex-1 px-3 py-1.5 text-sm sm:flex-initial"
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
            >
              {t("buttons.newInvoice")}
            </button>
            <button
              type="button"
              className="village-btn-secondary min-w-0 flex-1 sm:flex-initial"
              onClick={() => {
                void loadInvoices();
                router.refresh();
              }}
            >
              {t("buttons.refresh")}
            </button>
          </div>
        </div>

        {!loading && filteredInvoices.length === 0 ? (
          <div className="px-5 py-10 text-center sm:px-6">
            {accountTypeFilter === "resident" && selectedResidentId ? (
              <>
                <p className="text-base font-medium text-[var(--text-primary)]">
                  {t("invoices.noInvoicesForResident")}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {t("invoices.switchResidentHint")}
                </p>
              </>
            ) : accountTypeFilter === "home" ? (
              <>
                <p className="text-base font-medium text-[var(--text-primary)]">
                  {t("invoices.noHomeInvoices")}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {t("invoices.finalizeDraftHint")}
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-[var(--text-primary)]">
                  {t("empty.noInvoices")}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {t("invoices.startResidentDraftHintPrefix")}{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t("buttons.newInvoice")}
                  </span>{" "}
                  {t("invoices.startResidentDraftHintSuffix")}
                </p>
              </>
            )}
          </div>
        ) : null}

        {filteredInvoices.length > 0 ? (
          <div
            className={[
              "village-table-wrap rounded-none border-x-0 border-b-0 shadow-none",
              loading
                ? "pointer-events-none opacity-50 transition-opacity duration-150 motion-reduce:transition-none"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <table className="village-table">
              <thead className="village-thead">
                <tr>
                  <th className="village-th">{t("fields.invoiceNo")}</th>
                  <th className="village-th">{t("fields.account")}</th>
                  <th className="village-th">{t("fields.invoiceDate")}</th>
                  <th className="village-th">{t("fields.status")}</th>
                  <th className="village-th text-right">{t("fields.total")}</th>
                  <th className="village-th text-right">{t("fields.action")}</th>
                </tr>
              </thead>
              <tbody className="village-tbody">
                {filteredInvoices.map((invoice) => {
                  const accountName =
                    invoice.accountType === "home"
                      ? homeName
                      : (accountToResidentName.get(invoice.accountId) ??
                        t("invoiceDetail.unknownResident"));
                  const totalCell =
                    invoice.totalMinorSnapshot != null ? (
                      formatCents(invoice.totalMinorSnapshot, defaultCurrencyCode)
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    );

                  return (
                    <tr key={invoice.id}>
                      <td className="village-td font-mono tabular-nums">
                        {invoice.invNo?.trim() ? invoice.invNo : "—"}
                      </td>
                      <td className="village-td font-medium">{accountName}</td>
                      <td className="village-td-muted tabular-nums">
                        {invoiceDateLabel(invoice.issuedOn)}
                      </td>
                      <td className="village-td">
                        <span className={invoiceStatusBadgeClass(invoice.status)}>
                          {translateInvoiceStatus(t, invoice.status)}
                        </span>
                      </td>
                      <td className="village-td-muted text-right tabular-nums">{totalCell}</td>
                      <td className="village-td text-right">
                        <Link
                          href={invoiceDetailHref(homeId, invoice.id)}
                          className="village-button village-button--compact"
                        >
                          {t("buttons.openInvoice")}
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
