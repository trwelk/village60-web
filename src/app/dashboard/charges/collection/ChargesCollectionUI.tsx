"use client";

import {
  VillageList,
  VillageListEmpty,
  VillageListFilter,
} from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import { MarkInvoicePaidModal } from "@/app/dashboard/invoices/MarkInvoicePaidModal";
import { PrepayMonthsModal } from "./PrepayMonthsModal";
import { resolveSelectedHomeId } from "@/lib/dashboard/resolveSelectedHomeId";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/service";
import { formatCents } from "@/lib/money";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type HomeOption = { id: string; name: string; defaultCurrencyCode: string };

type ChargeRow = {
  id: string;
  chargeId: string;
  invoiceId: string;
  billingMonth: string;
  invoiceLineDescription: string;
  invoiceLineCategory: string;
  invoiceStatus: string;
  amountMinorSnapshot: number;
  paid: boolean;
  paidOn: string | null;
  residentId: string;
  residentFullName: string;
  wardLabelSnapshot: string | null;
};

type Summary = {
  totalBilledMinor: number;
  chargeCount: number;
  paidCount: number;
  unpaidCount: number;
  unpaidBalanceMinor: number;
};

type Props = { homes: HomeOption[] };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function ChargesCollectionUI({ homes }: Props) {
  const { t } = useI18n();
  const searchParams = useSearchParams();

  const now = new Date();
  const [homeId, setHomeId] = useState(() =>
    resolveSelectedHomeId(searchParams.get("homeId") ?? undefined, homes),
  );
  const [year, setYear] = useState(
    Number(searchParams.get("year") ?? now.getFullYear()),
  );
  const [month, setMonth] = useState(
    Number(searchParams.get("month") ?? now.getMonth() + 1),
  );

  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalBilledMinor: 0,
    chargeCount: 0,
    paidCount: 0,
    unpaidCount: 0,
    unpaidBalanceMinor: 0,
  });
  const [hasChargeBatch, setHasChargeBatch] = useState(false);
  const [activeResidentCount, setActiveResidentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [generatingCharges, setGeneratingCharges] = useState(false);
  const [payModalCharge, setPayModalCharge] = useState<ChargeRow | null>(null);
  const [prepayOpen, setPrepayOpen] = useState(false);

  const billingMonth = `${year}-${String(month).padStart(2, "0")}`;

  const fetchData = useCallback(async () => {
    if (!homeId) {
      setCharges([]);
      setSummary({
        totalBilledMinor: 0,
        chargeCount: 0,
        paidCount: 0,
        unpaidCount: 0,
        unpaidBalanceMinor: 0,
      });
      setHasChargeBatch(false);
      setActiveResidentCount(0);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      billingMonthFrom: billingMonth,
      billingMonthTo: billingMonth,
      pageSize: "200",
    });
    const res = await fetch(
      `/api/homes/${homeId}/monthly-charges?${params.toString()}`,
    );
    if (!res.ok) {
      setError(t("chargesCollection.loadError"));
      setCharges([]);
      setHasChargeBatch(false);
      setActiveResidentCount(0);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      charges: ChargeRow[];
      summary: Summary;
      hasChargeBatch?: boolean;
      activeResidentCount?: number;
    };
    setCharges(data.charges);
    setSummary(data.summary);
    setHasChargeBatch(data.hasChargeBatch ?? false);
    setActiveResidentCount(data.activeResidentCount ?? 0);
    setLoading(false);
  }, [homeId, billingMonth, t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function generateCharges() {
    if (!homeId) return;
    setGeneratingCharges(true);
    setError(null);
    const res = await fetch(`/api/homes/${homeId}/monthly-charges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingMonth }),
    });
    setGeneratingCharges(false);
    if (res.ok) {
      void fetchData();
    } else {
      setError(t("chargesCollection.generateChargesError"));
    }
  }

  async function markAllUnpaid() {
    if (!homeId) return;
    const unpaid = charges.filter(
      (c) => !c.paid && c.invoiceStatus === "finalized",
    );
    if (unpaid.length === 0) return;
    setSubmitting("__all__");
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    let hadError = false;
    for (const charge of unpaid) {
      const res = await fetch(
        `/api/homes/${homeId}/invoices/${charge.invoiceId}/pay`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paidOn: today,
            method: "cash",
          }),
        },
      );
      if (!res.ok) {
        hadError = true;
        break;
      }
    }
    setSubmitting(null);
    if (hadError) {
      setError(t("chargesCollection.markPaidError"));
    }
    void fetchData();
  }

  const selectedHomeCurrency =
    homes.find((h) => h.id === homeId)?.defaultCurrencyCode ??
    DEFAULT_CURRENCY_CODE;

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 2 + i;
    return { value: String(y), label: String(y) };
  });

  const monthOptions = MONTHS.map((label, i) => ({
    value: String(i + 1),
    label,
  }));

  const unpaidCharges = charges.filter(
    (c) => !c.paid && c.invoiceStatus === "finalized",
  );
  const paidCharges = charges.filter((c) => c.paid);

  return (
    <VillageList
      toolbar={
        <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
            {homeId ? (
              <button
                type="button"
                className="village-btn-secondary shrink-0"
                onClick={() => setPrepayOpen(true)}
              >
                {t("chargesCollection.prepayButton")}
              </button>
            ) : null}
            {homeId && hasChargeBatch && unpaidCharges.length > 0 && (
              <button
                type="button"
                className="village-btn-primary shrink-0"
                disabled={submitting === "__all__"}
                onClick={() => {
                  void markAllUnpaid();
                }}
              >
                {submitting === "__all__"
                  ? t("chargesCollection.markingPaid")
                  : t("chargesCollection.markAllPaid")}
              </button>
            )}
          </div>
          <button
            type="button"
            className="village-btn-secondary shrink-0"
            onClick={() => {
              void fetchData();
            }}
          >
            {t("buttons.refresh")}
          </button>
        </div>
      }
      filters={
        <>
          <VillageListFilter
            label={t("fields.home")}
            htmlFor="collection-home"
            minWidth="12rem"
          >
            <VillageSelect
              id="collection-home"
              value={homeId}
              onChange={(v) => setHomeId(v)}
              options={[
                { value: "", label: t("chargesCollection.selectHome") },
                ...homes.map((h) => ({ value: h.id, label: h.name })),
              ]}
            />
          </VillageListFilter>
          <VillageListFilter
            label={t("salaries.year")}
            htmlFor="collection-year"
            width="7rem"
          >
            <VillageSelect
              id="collection-year"
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              options={yearOptions}
            />
          </VillageListFilter>
          <VillageListFilter
            label={t("salaries.month")}
            htmlFor="collection-month"
            width="9rem"
          >
            <VillageSelect
              id="collection-month"
              value={String(month)}
              onChange={(v) => setMonth(Number(v))}
              options={monthOptions}
            />
          </VillageListFilter>
        </>
      }
      listTitle={null}
      loading={loading}
      error={error}
    >
      {!homeId ? (
        <p className="village-empty-hint py-10 text-center">
          {t("chargesCollection.selectHomeAndMonth")}
        </p>
      ) : (
        <>
          {!loading &&
          !hasChargeBatch &&
          activeResidentCount > 0 ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-4 py-3">
              <p className="text-sm text-[var(--foreground)]">
                {t("chargesCollection.chargesNotGenerated")}
              </p>
              <button
                type="button"
                className="village-btn-primary text-sm"
                disabled={generatingCharges}
                onClick={() => {
                  void generateCharges();
                }}
              >
                {generatingCharges
                  ? t("chargesCollection.generatingCharges")
                  : t("chargesCollection.generateCharges")}
              </button>
            </div>
          ) : null}
          {/* Summary cards */}
          {!loading && charges.length > 0 && (
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
                <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                  {t("chargesCollection.totalBilled")}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
                  {formatCents(summary.totalBilledMinor, selectedHomeCurrency)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {summary.chargeCount} {t("chargesCollection.chargesLabel")}
                </p>
              </div>
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--danger)_38%,var(--line-strong)_62%)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
                <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                  {t("chargesCollection.unpaidBalance")}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-[var(--danger)]">
                  {formatCents(
                    summary.unpaidBalanceMinor,
                    selectedHomeCurrency,
                  )}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {summary.unpaidCount} {t("chargesCollection.unpaidStatus").toLowerCase()}
                </p>
              </div>
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] p-4 shadow-sm">
                <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                  {t("chargesCollection.collectionRate")}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
                  {summary.paidCount}/{summary.chargeCount}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t("chargesCollection.paidLabel")}
                </p>
              </div>
            </div>
          )}

          {/* Charge table */}
          <table
            className="village-table"
            aria-label={t("chargesCollection.chargesTable")}
          >
            <thead className="village-thead">
              <tr>
                <th className="village-th">
                  {t("chargesCollection.residentColumn")}
                </th>
                <th className="village-th">
                  {t("chargesCollection.wardColumn")}
                </th>
                <th className="village-th">
                  {t("chargesCollection.amountColumn")}
                </th>
                <th className="village-th">{t("fields.status")}</th>
                <th className="village-th">{t("fields.action")}</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {!loading && charges.length === 0 ? (
                <VillageListEmpty
                  colSpan={5}
                  message={
                    activeResidentCount === 0
                      ? t("chargesCollection.noActiveResidents")
                      : t("chargesCollection.noCharges")
                  }
                />
              ) : null}
              {/* Unpaid first, then paid */}
              {[...unpaidCharges, ...paidCharges, ...charges.filter(
                (c) => !c.paid && c.invoiceStatus === "draft",
              )].map((c) => {
                const canMarkPaid =
                  hasChargeBatch &&
                  !c.paid &&
                  c.invoiceStatus === "finalized";

                return (
                <tr key={c.id}>
                  <td className="village-td font-medium">
                    {c.residentFullName}
                  </td>
                  <td className="village-td-muted">
                    {c.wardLabelSnapshot ?? "—"}
                  </td>
                  <td className="village-td-muted tabular-nums">
                    {formatCents(c.amountMinorSnapshot, selectedHomeCurrency)}
                  </td>
                  <td className="village-td">
                    {c.paid ? (
                      <span className="inline-flex items-center rounded-full bg-success-muted px-2 py-0.5 text-xs font-semibold text-success">
                        {t("chargesCollection.paidStatus")}
                      </span>
                    ) : c.invoiceStatus === "draft" ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {t("common.draft")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--danger)]">
                        {t("chargesCollection.unpaidStatus")}
                      </span>
                    )}
                  </td>
                  <td className="village-td">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/invoices/${encodeURIComponent(c.invoiceId)}?homeId=${encodeURIComponent(homeId)}`}
                        className="text-xs font-semibold text-pine underline decoration-terracotta/35 underline-offset-2 hover:text-terracotta"
                      >
                        {t("chargesCollection.openInvoice")}
                      </Link>
                      {canMarkPaid ? (
                        <button
                          type="button"
                          className="village-btn-primary text-xs"
                          disabled={
                            submitting === c.invoiceId ||
                            submitting === "__all__"
                          }
                          onClick={() => setPayModalCharge(c)}
                        >
                          {submitting === c.invoiceId
                            ? t("chargesCollection.markingPaid")
                            : t("chargesCollection.markPaid")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {prepayOpen && homeId ? (
        <PrepayMonthsModal
          open={prepayOpen}
          homeId={homeId}
          homes={homes}
          currencyCode={selectedHomeCurrency}
          onClose={() => setPrepayOpen(false)}
          onComplete={async () => {
            await fetchData();
          }}
        />
      ) : null}
      {payModalCharge && homeId ? (
        <MarkInvoicePaidModal
          open={payModalCharge != null}
          homeId={homeId}
          invoiceId={payModalCharge.invoiceId}
          amountMinor={payModalCharge.amountMinorSnapshot}
          currencyCode={selectedHomeCurrency}
          onClose={() => setPayModalCharge(null)}
          onPaid={async () => {
            setPayModalCharge(null);
            await fetchData();
          }}
        />
      ) : null}
    </VillageList>
  );
}
