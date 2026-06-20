"use client";

import {
  VillageList,
  VillageListEmpty,
  VillageListFilter,
} from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  buildSalariesDirectoryQueryString,
  salariesDirectoryStateFromSearchParams,
} from "@/lib/salaries/directoryPath";
import { dashboardStaffRemittanceHref } from "@/lib/dashboard/dashboardRoutes";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/service";
import { formatCents } from "@/lib/money";
import {
  isStaffRoleTitle,
  STAFF_ROLE_TITLES,
} from "@/lib/salaries/roleTitles";
import type {
  SalaryRemittance,
  StaffSalaryWithLastPaid,
} from "@/lib/salaries/service";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type HomeOption = { id: string; name: string; defaultCurrencyCode: string };
type CareStaffOption = { id: string; email: string };

type Props = {
  homes: HomeOption[];
  isAdmin: boolean;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function parseError(res: Response, fallback: string): Promise<string> {
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
    /* ignore */
  }
  return fallback;
}

function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const staffRoleOptions = STAFF_ROLE_TITLES.map((title) => ({
  value: title,
  label: title,
}));

function roleTitleOptionsForEdit(current: string) {
  if (current && !isStaffRoleTitle(current)) {
    return [{ value: current, label: current }, ...staffRoleOptions];
  }
  return staffRoleOptions;
}

export function StaffDirectoryUI({ homes, isAdmin }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlState = salariesDirectoryStateFromSearchParams(searchParams);

  const [salaries, setSalaries] = useState<StaffSalaryWithLastPaid[] | null>(
    null,
  );
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [careStaff, setCareStaff] = useState<CareStaffOption[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<SalaryRemittance[] | null>(
    null,
  );
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFullName, setCreateFullName] = useState("");
  const [createRoleTitle, setCreateRoleTitle] = useState("");
  const [createMonthlySalary, setCreateMonthlySalary] = useState("");
  const [createEffectiveFrom, setCreateEffectiveFrom] = useState(todayIsoDate);
  const [createPhone, setCreatePhone] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createUserId, setCreateUserId] = useState("");

  const [editSalary, setEditSalary] = useState<StaffSalaryWithLastPaid | null>(
    null,
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editRoleTitle, setEditRoleTitle] = useState("");
  const [editMonthlySalary, setEditMonthlySalary] = useState("");
  const [editEffectiveFrom, setEditEffectiveFrom] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "inactive">("active");

  const resetCreateForm = useCallback(() => {
    setCreateFullName("");
    setCreateRoleTitle("");
    setCreateMonthlySalary("");
    setCreateEffectiveFrom(todayIsoDate());
    setCreatePhone("");
    setCreateNotes("");
    setCreateUserId("");
  }, []);

  const closeCreateModal = useCallback(() => {
    setShowCreate(false);
    resetCreateForm();
    setCreateError(null);
  }, [resetCreateForm]);

  const closeEditModal = useCallback(() => {
    setEditSalary(null);
    setEditError(null);
  }, []);

  useEffect(() => {
    if (!showCreate) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreateModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showCreate, closeCreateModal]);

  useEffect(() => {
    if (!editSalary) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeEditModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editSalary, closeEditModal]);

  const navigate = useCallback(
    (next: Partial<typeof urlState>) => {
      const merged = { ...urlState, ...next };
      const qs = buildSalariesDirectoryQueryString(merged);
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, urlState],
  );

  const fetchCareStaff = useCallback(async (homeId: string) => {
    const res = await fetch(`/api/homes/${homeId}/care-staff`);
    if (!res.ok) {
      setCareStaff([]);
      return;
    }
    const data = (await res.json()) as { careStaff: CareStaffOption[] };
    setCareStaff(data.careStaff);
  }, []);

  useEffect(() => {
    if (!urlState.homeId || !isAdmin) {
      setCareStaff([]);
      return;
    }
    void fetchCareStaff(urlState.homeId);
  }, [urlState.homeId, isAdmin, fetchCareStaff]);

  const fetchSalaries = useCallback(async () => {
    if (!urlState.homeId) {
      setSalaries(null);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (urlState.query.trim()) params.set("query", urlState.query.trim());
    if (urlState.status) params.set("status", urlState.status);
    params.set("page", String(urlState.page));
    params.set("pageSize", String(urlState.pageSize));

    const res = await fetch(
      `/api/homes/${urlState.homeId}/staff-salaries?${params.toString()}`,
    );
    if (!res.ok) {
      setError(await parseError(res, t("common.requestFailed")));
      setSalaries(null);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      items: StaffSalaryWithLastPaid[];
      totalCount: number;
    };
    setSalaries(data.items);
    setTotalCount(data.totalCount);
    setLoading(false);
  }, [
    urlState.homeId,
    urlState.query,
    urlState.status,
    urlState.page,
    urlState.pageSize,
  ]);

  useEffect(() => {
    void fetchSalaries();
  }, [fetchSalaries]);

  const fetchPaymentHistory = useCallback(async () => {
    if (!urlState.homeId || isAdmin) {
      setPaymentHistory(null);
      return;
    }
    const record = salaries?.[0];
    if (!record) {
      setPaymentHistory(null);
      return;
    }
    setPaymentHistoryLoading(true);
    const res = await fetch(
      `/api/homes/${urlState.homeId}/staff-salaries/${record.id}?includeRemittances=true`,
    );
    if (!res.ok) {
      setPaymentHistory(null);
      setPaymentHistoryLoading(false);
      return;
    }
    const data = (await res.json()) as { remittances?: SalaryRemittance[] };
    setPaymentHistory(data.remittances ?? []);
    setPaymentHistoryLoading(false);
  }, [urlState.homeId, isAdmin, salaries]);

  useEffect(() => {
    if (!loading) {
      void fetchPaymentHistory();
    }
  }, [loading, fetchPaymentHistory]);

  function openEditModal(salary: StaffSalaryWithLastPaid) {
    setEditSalary(salary);
    setEditError(null);
    setEditUserId(salary.userId ?? "");
    setEditFullName(salary.fullName);
    setEditRoleTitle(salary.roleTitle);
    setEditMonthlySalary(String(salary.monthlySalaryMinor / 100));
    setEditEffectiveFrom(salary.effectiveFrom);
    setEditPhone(salary.phone ?? "");
    setEditNotes(salary.notes ?? "");
    setEditStatus(salary.status === "inactive" ? "inactive" : "active");
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!urlState.homeId) return;
    setCreateError(null);

    const salaryMajor = Number.parseFloat(createMonthlySalary);
    if (!Number.isFinite(salaryMajor) || salaryMajor <= 0) {
      setCreateError(t("staffDirectory.invalidMonthlySalary"));
      return;
    }
    if (!isStaffRoleTitle(createRoleTitle)) {
      setCreateError(t("staffDirectory.selectRoleTitle"));
      return;
    }

    const body: Record<string, unknown> = {
      fullName: createFullName.trim(),
      roleTitle: createRoleTitle.trim(),
      monthlySalaryMinor: Math.round(salaryMajor * 100),
      effectiveFrom: createEffectiveFrom,
      userId: createUserId || null,
    };
    const phone = createPhone.trim();
    const notes = createNotes.trim();
    if (phone) body.phone = phone;
    if (notes) body.notes = notes;

    const res = await fetch(`/api/homes/${urlState.homeId}/staff-salaries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setCreateError(await parseError(res, t("common.requestFailed")));
      return;
    }
    closeCreateModal();
    await fetchSalaries();
    router.refresh();
  }

  async function onEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!urlState.homeId || !editSalary) return;
    setEditError(null);

    const salaryMajor = Number.parseFloat(editMonthlySalary);
    if (!Number.isFinite(salaryMajor) || salaryMajor <= 0) {
      setEditError(t("staffDirectory.invalidMonthlySalary"));
      return;
    }
    if (!isStaffRoleTitle(editRoleTitle)) {
      setEditError(t("staffDirectory.selectRoleTitle"));
      return;
    }

    const body: Record<string, unknown> = {
      fullName: editFullName.trim(),
      roleTitle: editRoleTitle.trim(),
      monthlySalaryMinor: Math.round(salaryMajor * 100),
      effectiveFrom: editEffectiveFrom,
      userId: editUserId || null,
      status: editStatus,
    };
    const phone = editPhone.trim();
    const notes = editNotes.trim();
    body.phone = phone || null;
    body.notes = notes || null;

    const res = await fetch(
      `/api/homes/${urlState.homeId}/staff-salaries/${editSalary.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      setEditError(await parseError(res, t("common.requestFailed")));
      return;
    }
    closeEditModal();
    await fetchSalaries();
    router.refresh();
  }

  const careStaffEmailById = new Map(careStaff.map((u) => [u.id, u.email]));

  const selectedHomeCurrency =
    homes.find((h) => h.id === urlState.homeId)?.defaultCurrencyCode ??
    DEFAULT_CURRENCY_CODE;

  const activeFilterCount =
    (urlState.query.trim() ? 1 : 0) + (urlState.status ? 1 : 0);

  const colCount = isAdmin ? 6 : 5;

  return (
    <>
      <VillageList
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
              {isAdmin && urlState.homeId && (
                <Link
                  href={dashboardStaffRemittanceHref(urlState.homeId)}
                  className="village-btn-secondary"
                >
                  {t("staffDirectory.monthlyRemittance")}
                </Link>
              )}
              {isAdmin && urlState.homeId && (
                <button
                  type="button"
                  className="village-btn-primary"
                  onClick={() => {
                    setCreateError(null);
                    setShowCreate(true);
                  }}
                >
                  {t("staffDirectory.addStaff")}
                </button>
              )}
            </div>
            <button
              type="button"
              className="village-btn-secondary shrink-0"
              onClick={() => {
                void fetchSalaries();
                router.refresh();
              }}
            >
              {t("buttons.refresh")}
            </button>
          </div>
        }
        filters={
          <>
            <VillageListFilter label={t("fields.home")} htmlFor="staff-home" minWidth="12rem">
              <VillageSelect
                id="staff-home"
                value={urlState.homeId}
                onChange={(v) => navigate({ homeId: v, page: 1 })}
                options={[
                  { value: "", label: t("salaries.selectHome") },
                  ...homes.map((h) => ({ value: h.id, label: h.name })),
                ]}
              />
            </VillageListFilter>
            {isAdmin && (
              <VillageListFilter label={t("staffDirectory.nameSearch")} htmlFor="staff-query">
                <input
                  id="staff-query"
                  className="village-input"
                  value={urlState.query}
                  onChange={(e) => navigate({ query: e.target.value, page: 1 })}
                  placeholder={t("placeholders.partialName")}
                  autoComplete="off"
                />
              </VillageListFilter>
            )}
            {isAdmin && (
              <VillageListFilter label={t("fields.status")} htmlFor="staff-status" width="10rem">
                <VillageSelect
                  id="staff-status"
                  value={urlState.status}
                  onChange={(v) =>
                    navigate({ status: v as "active" | "inactive" | "", page: 1 })
                  }
                  options={[
                    { value: "", label: t("common.all") },
                    { value: "active", label: t("common.active") },
                    { value: "inactive", label: t("common.inactive") },
                  ]}
                />
              </VillageListFilter>
            )}
          </>
        }
        filtersCollapsible={isAdmin}
        activeFilterCount={activeFilterCount}
        listTitle={null}
        loading={loading}
        error={error}
        pagination={
          urlState.homeId && isAdmin
            ? {
                page: urlState.page,
                pageSize: urlState.pageSize,
                totalCount,
                onPrevious: () => navigate({ page: urlState.page - 1 }),
                onNext: () => navigate({ page: urlState.page + 1 }),
              }
            : undefined
        }
      >
        {!urlState.homeId ? (
          <p className="village-empty-hint py-10 text-center">
            {isAdmin
              ? t("staffDirectory.selectHomePromptAdmin")
              : t("staffDirectory.selectHomePromptCare")}
          </p>
        ) : (
          <table className="village-table" aria-label={t("salaries.staffDirectory")}>
            <thead className="village-thead">
              <tr>
                <th className="village-th">{t("fields.name")}</th>
                <th className="village-th">{t("fields.role")}</th>
                {isAdmin ? <th className="village-th">{t("staffDirectory.linkedUser")}</th> : null}
                <th className="village-th">{t("staffDirectory.monthlySalary")}</th>
                <th className="village-th">{t("fields.status")}</th>
                <th className="village-th">{t("staffDirectory.lastPaid")}</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {!loading && salaries && salaries.length === 0 ? (
                <VillageListEmpty
                  colSpan={colCount}
                  message={
                    isAdmin
                      ? t("staffDirectory.noStaffFound")
                      : t("staffDirectory.noSalaryLinked")
                  }
                />
              ) : null}
              {salaries?.map((s) => (
                <tr key={s.id}>
                  <td className="village-td font-medium">
                    {isAdmin ? (
                      <button
                        type="button"
                        className="text-left font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
                        onClick={() => openEditModal(s)}
                      >
                        {s.fullName}
                      </button>
                    ) : (
                      s.fullName
                    )}
                  </td>
                  <td className="village-td-muted">{s.roleTitle}</td>
                  {isAdmin ? (
                    <td className="village-td-muted">
                      {s.userId
                        ? (careStaffEmailById.get(s.userId) ?? s.userId)
                        : "—"}
                    </td>
                  ) : null}
                  <td className="village-td-muted">
                    {formatCents(s.monthlySalaryMinor, selectedHomeCurrency)}
                  </td>
                  <td className="village-td-muted">
                    {s.status === "active" ? (
                      <span className="inline-flex items-center rounded-full bg-success-muted px-2 py-0.5 text-xs font-semibold text-success">
                        {t("common.active")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--text-muted)_14%,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                        {t("common.inactive")}
                      </span>
                    )}
                  </td>
                  <td className="village-td-muted">{s.lastPaidMonth ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </VillageList>

      {!isAdmin && urlState.homeId && salaries && salaries.length > 0 ? (
        <section className="village-card mt-6 p-5 sm:p-6">
          <h2 className="font-display text-lg font-normal text-[var(--text-primary)]">
            {t("staffDirectory.paymentHistory")}
          </h2>
          {paymentHistoryLoading ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]">{t("loading.generic")}</p>
          ) : paymentHistory && paymentHistory.length > 0 ? (
            <table className="village-table mt-4" aria-label={t("staffDirectory.salaryPaymentHistory")}>
              <thead className="village-thead">
                <tr>
                  <th className="village-th">{t("staffDirectory.period")}</th>
                  <th className="village-th">{t("staffDirectory.amountPaid")}</th>
                  <th className="village-th">{t("invoiceDetail.paidOn")}</th>
                  <th className="village-th">{t("invoiceDetail.externalReference")}</th>
                </tr>
              </thead>
              <tbody className="village-tbody">
                {paymentHistory.map((r) => (
                  <tr key={r.id}>
                    <td className="village-td-muted">
                      {formatPeriod(r.periodYear, r.periodMonth)}
                    </td>
                    <td className="village-td-muted">
                      {formatCents(r.amountPaidMinor, selectedHomeCurrency)}
                    </td>
                    <td className="village-td-muted">{r.paidOn}</td>
                    <td className="village-td-muted">{r.reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              {t("staffDirectory.noPaymentsRecorded")}
            </p>
          )}
        </section>
      ) : null}

      {showCreate
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label={t("staffDirectory.dismissAddStaff")}
                onClick={closeCreateModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="staff-create-modal-heading"
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] shadow-[0_-8px_40px_-12px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl sm:shadow-[0_22px_60px_-24px_color-mix(in_srgb,var(--text-primary)_38%,transparent)]"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                            {t("nav.staff")}
                          </p>
                          <h2
                            id="staff-create-modal-heading"
                            className="font-display text-xl font-normal tracking-tight text-[var(--text-primary)]"
                          >
                            {t("staffDirectory.addStaffMember")}
                          </h2>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)]"
                          onClick={closeCreateModal}
                        >
                          {t("buttons.close")}
                        </button>
                      </div>
                    </div>
                    <form
                      onSubmit={onCreate}
                      className="flex flex-col gap-5 p-5 sm:p-6"
                    >
                      <label className="flex flex-col gap-1.5 text-sm">
                        <span className="village-field-label">
                          {t("staffDirectory.linkedUserOptional")}
                        </span>
                        <VillageSelect
                          value={createUserId}
                          onChange={setCreateUserId}
                          options={[
                            { value: "", label: t("staffDirectory.noLinkedUser") },
                            ...careStaff.map((u) => ({
                              value: u.id,
                              label: u.email,
                            })),
                          ]}
                        />
                      </label>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">{t("fields.fullName")}</span>
                          <input
                            className="village-input"
                            value={createFullName}
                            onChange={(e) => setCreateFullName(e.target.value)}
                            required
                            autoComplete="off"
                          />
                        </label>
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">{t("fields.role")}</span>
                          <VillageSelect
                            value={createRoleTitle}
                            onChange={setCreateRoleTitle}
                            placeholder={t("staffDirectory.selectRole")}
                            ariaRequired
                            options={staffRoleOptions}
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">
                            {t("staffDirectory.monthlySalary")} ({selectedHomeCurrency})
                          </span>
                          <input
                            className="village-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={createMonthlySalary}
                            onChange={(e) =>
                              setCreateMonthlySalary(e.target.value)
                            }
                            required
                            autoComplete="off"
                          />
                        </label>
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">
                            {t("staffDirectory.effectiveFrom")}
                          </span>
                          <input
                            className="village-input"
                            type="date"
                            value={createEffectiveFrom}
                            onChange={(e) =>
                              setCreateEffectiveFrom(e.target.value)
                            }
                            required
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">
                            {t("staffDirectory.phoneOptional")}
                          </span>
                          <input
                            className="village-input"
                            type="tel"
                            value={createPhone}
                            onChange={(e) => setCreatePhone(e.target.value)}
                            autoComplete="off"
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1.5 text-sm">
                        <span className="village-field-label">
                          {t("staffDirectory.notesOptional")}
                        </span>
                        <textarea
                          className="village-input min-h-[5rem] resize-y"
                          value={createNotes}
                          onChange={(e) => setCreateNotes(e.target.value)}
                          rows={3}
                        />
                      </label>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          type="submit"
                          className="village-btn-primary min-h-10 w-fit px-5"
                        >
                          {t("staffDirectory.addStaffMember")}
                        </button>
                        {createError ? (
                          <p className="text-sm font-medium text-[var(--danger)]">
                            {createError}
                          </p>
                        ) : null}
                      </div>
                    </form>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {editSalary
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label={t("staffDirectory.dismissEditStaff")}
                onClick={closeEditModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="staff-edit-modal-heading"
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] shadow-[0_-8px_40px_-12px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl sm:shadow-[0_22px_60px_-24px_color-mix(in_srgb,var(--text-primary)_38%,transparent)]"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                            {t("nav.staff")}
                          </p>
                          <h2
                            id="staff-edit-modal-heading"
                            className="font-display text-xl font-normal tracking-tight text-[var(--text-primary)]"
                          >
                            {t("staffDirectory.editStaffMember")}
                          </h2>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)]"
                          onClick={closeEditModal}
                        >
                          {t("buttons.close")}
                        </button>
                      </div>
                    </div>
                    <form
                      onSubmit={onEdit}
                      className="flex flex-col gap-5 p-5 sm:p-6"
                    >
                      <label className="flex flex-col gap-1.5 text-sm">
                        <span className="village-field-label">{t("staffDirectory.linkedUser")}</span>
                        <VillageSelect
                          value={editUserId}
                          onChange={setEditUserId}
                          options={[
                            { value: "", label: t("staffDirectory.noLinkedUser") },
                            ...careStaff.map((u) => ({
                              value: u.id,
                              label: u.email,
                            })),
                          ]}
                        />
                      </label>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">{t("fields.fullName")}</span>
                          <input
                            className="village-input"
                            value={editFullName}
                            onChange={(e) => setEditFullName(e.target.value)}
                            required
                            autoComplete="off"
                          />
                        </label>
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">{t("fields.role")}</span>
                          <VillageSelect
                            value={editRoleTitle}
                            onChange={setEditRoleTitle}
                            placeholder={t("staffDirectory.selectRole")}
                            ariaRequired
                            options={roleTitleOptionsForEdit(editRoleTitle)}
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">
                            {t("staffDirectory.monthlySalary")} ({selectedHomeCurrency})
                          </span>
                          <input
                            className="village-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={editMonthlySalary}
                            onChange={(e) =>
                              setEditMonthlySalary(e.target.value)
                            }
                            required
                            autoComplete="off"
                          />
                        </label>
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">
                            {t("staffDirectory.effectiveFrom")}
                          </span>
                          <input
                            className="village-input"
                            type="date"
                            value={editEffectiveFrom}
                            onChange={(e) =>
                              setEditEffectiveFrom(e.target.value)
                            }
                            required
                          />
                        </label>
                        <label className="flex min-w-[10rem] flex-col gap-1.5 text-sm">
                          <span className="village-field-label">{t("fields.status")}</span>
                          <VillageSelect
                            value={editStatus}
                            onChange={(v) =>
                              setEditStatus(v as "active" | "inactive")
                            }
                            options={[
                              { value: "active", label: t("common.active") },
                              { value: "inactive", label: t("common.inactive") },
                            ]}
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
                          <span className="village-field-label">{t("fields.phone")}</span>
                          <input
                            className="village-input"
                            type="tel"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            autoComplete="off"
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1.5 text-sm">
                        <span className="village-field-label">{t("fields.notes")}</span>
                        <textarea
                          className="village-input min-h-[5rem] resize-y"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={3}
                        />
                      </label>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          type="submit"
                          className="village-btn-primary min-h-10 w-fit px-5"
                        >
                          {t("staffDirectory.saveChanges")}
                        </button>
                        {editError ? (
                          <p className="text-sm font-medium text-[var(--danger)]">
                            {editError}
                          </p>
                        ) : null}
                      </div>
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
