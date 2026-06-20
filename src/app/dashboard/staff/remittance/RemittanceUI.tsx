"use client";

import {
  VillageList,
  VillageListEmpty,
  VillageListFilter,
} from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import { dashboardStaffHref } from "@/lib/dashboard/dashboardRoutes";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedMonthOptions } from "@/lib/i18n/localizedMonth";
import { translateWith } from "@/lib/i18n/messages";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/service";
import { formatCents } from "@/lib/money";
import type { SalaryAccrual } from "@/lib/salaries/accruals";
import type { StaffSalary, SalaryRemittance } from "@/lib/salaries/service";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type HomeOption = { id: string; name: string; defaultCurrencyCode: string };
type StaffWithRemittance = StaffSalary & {
  remittance: SalaryRemittance | null;
  accrual: SalaryAccrual | null;
};

type Props = { homes: HomeOption[] };

export function RemittanceUI({ homes }: Props) {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();

  const now = new Date();
  const [homeId, setHomeId] = useState(searchParams.get("homeId") ?? "");
  const [year, setYear] = useState(
    Number(searchParams.get("year") ?? now.getFullYear()),
  );
  const [month, setMonth] = useState(
    Number(searchParams.get("month") ?? now.getMonth() + 1),
  );

  const [staff, setStaff] = useState<StaffWithRemittance[]>([]);
  const [hasAccrualBatch, setHasAccrualBatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [generatingAccruals, setGeneratingAccruals] = useState(false);

  const billingMonth = `${year}-${String(month).padStart(2, "0")}`;

  const fetchData = useCallback(async () => {
    if (!homeId) {
      setStaff([]);
      setHasAccrualBatch(false);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
    });
    const res = await fetch(
      `/api/homes/${homeId}/salary-remittances?${params.toString()}`,
    );
    if (!res.ok) {
      setError(t("salaries.remittanceLoadError"));
      setStaff([]);
      setHasAccrualBatch(false);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      staff: StaffWithRemittance[];
      hasAccrualBatch: boolean;
    };
    setStaff(data.staff);
    setHasAccrualBatch(data.hasAccrualBatch);
    setLoading(false);
  }, [homeId, year, month, t]);

  useEffect(() => {
    setNotice(null);
    void fetchData();
  }, [fetchData]);

  async function generateAccruals() {
    if (!homeId) return;
    setGeneratingAccruals(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/homes/${homeId}/salary-accruals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingMonth }),
    });
    setGeneratingAccruals(false);
    if (res.ok) {
      const data = (await res.json()) as {
        created: number;
        skipped: { staffSalaryId: string; reason: string }[];
      };
      if (data.created > 0) {
        setNotice(
          translateWith(locale, "salaries.generateAccrualsCreated", {
            count: String(data.created),
          }),
        );
      } else if (data.skipped.length > 0) {
        setNotice(t("salaries.generateAccrualsAlreadyExist"));
      } else {
        setNotice(t("salaries.generateAccrualsNoneEligible"));
      }
      void fetchData();
    } else {
      setError(t("salaries.generateAccrualsError"));
    }
  }

  async function markPaid(staffSalaryId: string, amountAccruedMinor: number) {
    if (!homeId) return;
    setSubmitting(staffSalaryId);
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/homes/${homeId}/salary-remittances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffSalaryId,
        periodYear: year,
        periodMonth: month,
        amountPaidMinor: amountAccruedMinor,
        paidOn: today,
      }),
    });
    setSubmitting(null);
    if (res.ok) {
      void fetchData();
    } else {
      setError(t("salaries.markPaidError"));
    }
  }

  async function undoPaid(remittanceId: string) {
    if (!homeId) return;
    setSubmitting(remittanceId);
    const res = await fetch(
      `/api/homes/${homeId}/salary-remittances/${remittanceId}`,
      { method: "DELETE" },
    );
    setSubmitting(null);
    if (res.ok) {
      void fetchData();
    } else {
      setError(t("salaries.undoPaidError"));
    }
  }

  const staffMissingAccrual = staff.some(
    (s) => !s.accrual && !s.remittance,
  );

  const selectedHomeCurrency =
    homes.find((h) => h.id === homeId)?.defaultCurrencyCode ??
    DEFAULT_CURRENCY_CODE;

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 2 + i;
    return { value: String(y), label: String(y) };
  });

  const monthOptions = localizedMonthOptions(locale);

  return (
    <VillageList
      toolbar={
        <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
            {homeId && (
              <Link
                href={dashboardStaffHref(homeId)}
                className="village-btn-secondary"
              >
                {t("salaries.staffDirectory")}
              </Link>
            )}
          </div>
          <button
            type="button"
            className="village-btn-secondary shrink-0"
            onClick={() => {
              setNotice(null);
              void fetchData();
            }}
          >
            {t("buttons.refresh")}
          </button>
        </div>
      }
      filters={
        <>
          <VillageListFilter label={t("fields.home")} htmlFor="remittance-home" minWidth="12rem">
            <VillageSelect
              id="remittance-home"
              value={homeId}
              onChange={(v) => setHomeId(v)}
              options={[
                { value: "", label: t("salaries.selectHome") },
                ...homes.map((h) => ({ value: h.id, label: h.name })),
              ]}
            />
          </VillageListFilter>
          <VillageListFilter label={t("salaries.year")} htmlFor="remittance-year" width="7rem">
            <VillageSelect
              id="remittance-year"
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              options={yearOptions}
            />
          </VillageListFilter>
          <VillageListFilter label={t("salaries.month")} htmlFor="remittance-month" width="9rem">
            <VillageSelect
              id="remittance-month"
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
          {t("salaries.selectHomeAndMonth")}
        </p>
      ) : (
        <>
          {notice ? (
            <div className="mb-4 rounded-lg border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] px-4 py-3">
              <p className="text-sm text-[var(--foreground)]">{notice}</p>
            </div>
          ) : null}
          {!loading && staffMissingAccrual && staff.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-4 py-3">
              <p className="text-sm text-[var(--foreground)]">
                {hasAccrualBatch
                  ? t("salaries.someAccrualsMissing")
                  : t("salaries.accrualsNotGenerated")}
              </p>
              <button
                type="button"
                className="village-btn-primary text-sm"
                disabled={generatingAccruals}
                onClick={() => {
                  void generateAccruals();
                }}
              >
                {generatingAccruals
                  ? t("salaries.generatingAccruals")
                  : t("salaries.generateAccruals")}
              </button>
            </div>
          ) : null}
          <table className="village-table" aria-label={t("salaries.remittanceTable")}>
            <thead className="village-thead">
              <tr>
                <th className="village-th">{t("fields.name")}</th>
                <th className="village-th">{t("fields.role")}</th>
                <th className="village-th">{t("salaries.salaryColumn")}</th>
                <th className="village-th">{t("fields.status")}</th>
                <th className="village-th">{t("fields.action")}</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {!loading && staff.length === 0 ? (
                <VillageListEmpty
                  colSpan={5}
                  message={t("salaries.noStaffForMonth")}
                />
              ) : null}
              {staff.map((s) => {
                const accruedAmount = s.accrual?.amountAccruedMinor ?? s.monthlySalaryMinor;
                const canMarkPaid =
                  hasAccrualBatch &&
                  s.accrual?.status === "accrued" &&
                  !s.remittance;

                return (
                  <tr key={s.id}>
                    <td className="village-td font-medium">{s.fullName}</td>
                    <td className="village-td-muted">{s.roleTitle}</td>
                    <td className="village-td-muted">
                      {formatCents(accruedAmount, selectedHomeCurrency)}
                    </td>
                    <td className="village-td">
                      {s.remittance ? (
                        <span className="inline-flex items-center rounded-full bg-success-muted px-2 py-0.5 text-xs font-semibold text-success">
                          {translateWith(locale, "salaries.paidStatus", {
                            date: s.remittance.paidOn,
                          })}
                        </span>
                      ) : s.accrual?.status === "accrued" ? (
                        <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--warning)]">
                          {t("salaries.accruedUnpaid")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {t("salaries.noAccrual")}
                        </span>
                      )}
                    </td>
                    <td className="village-td">
                      {s.remittance ? (
                        <button
                          type="button"
                          className="village-btn-secondary text-xs"
                          disabled={submitting === s.remittance.id}
                          onClick={() => undoPaid(s.remittance!.id)}
                        >
                          {t("buttons.undo")}
                        </button>
                      ) : canMarkPaid ? (
                        <button
                          type="button"
                          className="village-btn-primary text-xs"
                          disabled={submitting === s.id}
                          onClick={() => markPaid(s.id, accruedAmount)}
                        >
                          {t("salaries.markPaid")}
                        </button>
                      ) : (
                        <span className="village-td-muted text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </VillageList>
  );
}
