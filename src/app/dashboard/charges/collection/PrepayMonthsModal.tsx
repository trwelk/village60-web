"use client";

import { MarkInvoicePaidModal } from "@/app/dashboard/invoices/MarkInvoicePaidModal";
import {
  INVOICE_MODAL_CLOSE_BTN_CLASS,
  INVOICE_MODAL_PORTAL_SHELL_CLASS,
  INVOICE_MODAL_PRIMARY_BTN_CLASS,
} from "@/app/dashboard/invoices/invoiceModalStyles";
import { VillageSelect } from "@/components/VillageSelect";
import { shiftBillingMonth, utcBillingMonthFromMs } from "@/lib/billing/billingMonth";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type HomeOption = { id: string; name: string; defaultCurrencyCode: string };

type ResidentOption = {
  id: string;
  fullName: string;
};

type Props = {
  open: boolean;
  homeId: string;
  homes: HomeOption[];
  currencyCode: string;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
};

const MONTH_LABELS = [
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
] as const;

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const monthIndex = Number(m) - 1;
  const label = MONTH_LABELS[monthIndex] ?? m;
  return `${label} ${y}`;
}

function futureMonthOptions(count: number): string[] {
  const start = shiftBillingMonth(utcBillingMonthFromMs(Date.now()), 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(shiftBillingMonth(start, i));
  }
  return out;
}

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

function useBodyScrollLock(open: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onEscape]);
}

export function PrepayMonthsModal({
  open,
  homeId,
  homes,
  currencyCode,
  onClose,
  onComplete,
}: Props) {
  const { t } = useI18n();
  const monthOptions = useMemo(() => futureMonthOptions(12), []);
  const [residentId, setResidentId] = useState("");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [residents, setResidents] = useState<ResidentOption[]>([]);
  const [loadingResidents, setLoadingResidents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<{
    invoiceId: string;
    totalMinorSnapshot: number;
  } | null>(null);

  const handleClose = useCallback(() => {
    if (!submitting) onClose();
  }, [onClose, submitting]);

  useBodyScrollLock(open && payTarget == null, handleClose);

  useEffect(() => {
    if (!open) return;
    setResidentId("");
    setSelectedMonths([]);
    setFormError(null);
    setPayTarget(null);
  }, [open, homeId]);

  useEffect(() => {
    if (!open || !homeId) {
      setResidents([]);
      return;
    }
    let cancelled = false;
    setLoadingResidents(true);
    void (async () => {
      const params = new URLSearchParams({ status: "active", pageSize: "200" });
      const res = await fetch(`/api/homes/${homeId}/residents?${params.toString()}`);
      if (cancelled) return;
      if (!res.ok) {
        setResidents([]);
        setLoadingResidents(false);
        return;
      }
      const data = (await res.json()) as {
        residents?: { id: string; fullName: string }[];
      };
      const list = (data.residents ?? []).map((r) => ({
        id: r.id,
        fullName: r.fullName,
      }));
      setResidents(list);
      setResidentId((prev) => prev || list[0]?.id || "");
      setLoadingResidents(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, homeId]);

  function toggleMonth(ym: string) {
    setSelectedMonths((prev) =>
      prev.includes(ym) ? prev.filter((m) => m !== ym) : [...prev, ym].sort(),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!homeId) {
      setFormError(t("chargesCollection.prepaySelectHome"));
      return;
    }
    if (!residentId) {
      setFormError(t("chargesCollection.prepaySelectResident"));
      return;
    }
    if (selectedMonths.length === 0) {
      setFormError(t("chargesCollection.prepaySelectMonths"));
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/homes/${homeId}/monthly-charges/prepay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentId, months: selectedMonths }),
      });
      if (!res.ok) {
        setFormError(await parseError(res));
        return;
      }
      const data = (await res.json()) as {
        invoiceId: string;
        totalMinorSnapshot: number;
      };
      setPayTarget(data);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  if (payTarget) {
    return (
      <MarkInvoicePaidModal
        open
        homeId={homeId}
        invoiceId={payTarget.invoiceId}
        amountMinor={payTarget.totalMinorSnapshot}
        currencyCode={currencyCode}
        onClose={() => {
          setPayTarget(null);
          onClose();
        }}
        onPaid={async () => {
          setPayTarget(null);
          await onComplete();
          onClose();
        }}
      />
    );
  }

  const selectedHomeName = homes.find((h) => h.id === homeId)?.name ?? homeId;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
      <button
        type="button"
        className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
        onClick={handleClose}
        aria-label={t("buttons.close")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prepay-months-title"
        className={INVOICE_MODAL_PORTAL_SHELL_CLASS}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="village-card overflow-hidden border-0 p-0 shadow-none">
            <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2
                    id="prepay-months-title"
                    className="text-xl font-semibold tracking-tight text-pine-2"
                  >
                    {t("chargesCollection.prepayTitle")}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {t("chargesCollection.prepayHint")}
                  </p>
                </div>
                <button
                  type="button"
                  className={INVOICE_MODAL_CLOSE_BTN_CLASS}
                  onClick={handleClose}
                  disabled={submitting}
                >
                  {t("buttons.close")}
                </button>
              </div>
            </div>
            <form className="grid gap-5 p-5 sm:p-6" onSubmit={(e) => void submit(e)}>
              {formError ? (
                <p className="village-alert-error text-sm" role="alert">
                  {formError}
                </p>
              ) : null}
              <label className="flex flex-col gap-1 text-xs">
                <span className="village-field-label">{t("fields.home")}</span>
                <input
                  className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
                  value={selectedHomeName}
                  readOnly
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="village-field-label">
                  {t("chargesCollection.residentColumn")}
                </span>
                <VillageSelect
                  id="prepay-resident"
                  value={residentId}
                  onChange={setResidentId}
                  disabled={loadingResidents || residents.length === 0}
                  options={
                    residents.length === 0
                      ? [{ value: "", label: t("chargesCollection.prepayNoResidents") }]
                      : residents.map((r) => ({ value: r.id, label: r.fullName }))
                  }
                />
              </label>
              <fieldset className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <legend className="village-field-label">
                    {t("chargesCollection.prepayMonthsLabel")}
                  </legend>
                  {monthOptions.length > 0 && (
                    <button
                      type="button"
                      className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-strong)] transition-colors"
                      onClick={() =>
                        setSelectedMonths((prev) =>
                          prev.length === monthOptions.length ? [] : [...monthOptions].sort(),
                        )
                      }
                    >
                      {selectedMonths.length === monthOptions.length
                        ? t("buttons.clearAll")
                        : t("buttons.selectAll")}
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {monthOptions.map((ym) => {
                    const checked = selectedMonths.includes(ym);
                    return (
                      <label
                        key={ym}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-all duration-150 ${
                          checked
                            ? "border-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_6%,transparent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
                            : "border-[color:color-mix(in_srgb,var(--line-strong)_35%,transparent)] hover:border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_40%,transparent)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="village-checkbox shrink-0"
                          checked={checked}
                          onChange={() => toggleMonth(ym)}
                        />
                        <span className={`font-medium ${checked ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                          {formatMonthLabel(ym)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className={`${INVOICE_MODAL_PRIMARY_BTN_CLASS} flex-1`}
                  disabled={submitting || !homeId || selectedMonths.length === 0}
                >
                  {submitting
                    ? t("chargesCollection.prepayCreating")
                    : t("chargesCollection.prepaySubmit")}
                </button>
                {selectedMonths.length > 0 && (
                  <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-1.5 text-xs font-semibold tabular-nums text-[var(--accent-strong)]">
                    {selectedMonths.length}
                  </span>
                )}
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
