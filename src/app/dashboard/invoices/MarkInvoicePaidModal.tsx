"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { translateWith } from "@/lib/i18n/messages";
import { formatCents } from "@/lib/money";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  INVOICE_MODAL_CLOSE_BTN_CLASS,
  INVOICE_MODAL_PORTAL_SHELL_CLASS,
  INVOICE_MODAL_PRIMARY_BTN_CLASS,
} from "./invoiceModalStyles";

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

type Props = {
  open: boolean;
  homeId: string;
  invoiceId: string;
  amountMinor: number;
  currencyCode: string;
  onClose: () => void;
  onPaid: () => void | Promise<void>;
};

export function MarkInvoicePaidModal({
  open,
  homeId,
  invoiceId,
  amountMinor,
  currencyCode,
  onClose,
  onPaid,
}: Props) {
  const { t, locale } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState("cash");
  const [externalReference, setExternalReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (!submitting) onClose();
  }, [onClose, submitting]);

  useBodyScrollLock(open, handleClose);

  useEffect(() => {
    if (!open) return;
    setPaidOn(new Date().toISOString().slice(0, 10));
    setMethod("cash");
    setExternalReference("");
    setNotes("");
    setFormError(null);
  }, [open, invoiceId]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(
        `/api/homes/${homeId}/invoices/${invoiceId}/pay`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paidOn,
            method,
            externalReference: externalReference.trim() || null,
            notes: notes.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        setFormError(await parseError(res, t("common.requestFailed")));
        return;
      }
      await onPaid();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

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
        aria-labelledby="mark-invoice-paid-title"
        className={INVOICE_MODAL_PORTAL_SHELL_CLASS}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="village-card overflow-hidden border-0 p-0 shadow-none">
            <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2
                    id="mark-invoice-paid-title"
                    className="text-xl font-semibold tracking-tight text-pine-2"
                  >
                    {t("invoiceDetail.markPaidModalTitle")}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {t("invoiceDetail.markPaidModalHint")}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                    {translateWith(locale, "invoiceDetail.fullAmountNote", {
                      amount: formatCents(amountMinor, currencyCode),
                    })}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="village-field-label">{t("invoiceDetail.paidOn")}</span>
                  <input
                    className="village-input"
                    type="date"
                    value={paidOn}
                    onChange={(e) => setPaidOn(e.target.value)}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="village-field-label">
                    {t("invoiceDetail.paymentMethod")}
                  </span>
                  <select
                    className="village-input"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="cash">{t("invoiceDetail.methodCash")}</option>
                    <option value="transfer">{t("invoiceDetail.methodTransfer")}</option>
                    <option value="card">{t("invoiceDetail.methodCard")}</option>
                    <option value="other">{t("invoiceDetail.methodOther")}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                  <span className="village-field-label">
                    {t("invoiceDetail.externalReference")}
                  </span>
                  <input
                    className="village-input"
                    value={externalReference}
                    onChange={(e) => setExternalReference(e.target.value)}
                    placeholder={t("invoiceDetail.externalReferencePlaceholder")}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs">
                <span className="village-field-label">{t("invoiceDetail.paymentNotes")}</span>
                <textarea
                  className="village-input min-h-[72px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className={INVOICE_MODAL_PRIMARY_BTN_CLASS}
                disabled={submitting}
              >
                {submitting
                  ? t("invoiceDetail.markingPaid")
                  : t("invoiceDetail.markPaid")}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
