"use client";

import { VillageSelect } from "@/components/VillageSelect";
import type { ExpenseTypeDto } from "@/lib/expenseTypes/service";
import type { HomeExpenseLedgerRow } from "@/lib/homeExpenses/ledgerShared";
import {
  MAX_HOME_EXPENSE_ATTACHMENT_FILE_BYTES,
  MAX_HOME_EXPENSE_ATTACHMENTS_PER_EXPENSE,
} from "@/lib/homeExpenseAttachments/caps";
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

export const MODAL_PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,#c2410c_78%,transparent)] bg-gradient-to-br from-[#fdba74] to-[#ea580c] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,#fef3c7_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,#c2410c_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100 min-h-10";

const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

function majorToMinor(majorStr: string): number {
  const n = Number.parseFloat(majorStr.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    return Number.NaN;
  }
  return Math.round(n * 100);
}

function minorToMajorInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** YYYY-MM-DD in local timezone for `<input type="date">`. */
function localDateInputValue(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ExpenseModalShell({
  mode,
  currencyCode,
  closeDisabled,
  children,
  onClose,
}: {
  mode: "create" | "edit";
  currencyCode: string;
  closeDisabled: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const requestClose = useCallback(() => {
    if (!closeDisabled) onClose();
  }, [closeDisabled, onClose]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [requestClose]);

  const eyebrow =
    mode === "create" ? "New home expense" : "Edit home expense";
  const headline = mode === "create" ? "Add expense" : "Edit expense";
  const description =
    mode === "create"
      ? "Record an operating cost for this home. Amounts are in major currency units."
      : "Update dates, vendor, references, or notes. Manage receipt attachments below.";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
      <button
        type="button"
        className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
        aria-label="Dismiss expense dialog"
        onClick={() => {
          if (closeDisabled) return;
          requestClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-modal-heading"
        data-testid="expense-modal-panel"
        className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] shadow-[0_-8px_40px_-12px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl sm:shadow-[0_22px_60px_-24px_color-mix(in_srgb,var(--text-primary)_38%,transparent)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="village-card overflow-hidden border-0 p-0 shadow-none">
            <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex max-w-2xl gap-4">
                  <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine text-lg font-display text-cream shadow-[0_14px_34px_-20px_rgba(26,77,58,0.8)]">
                    {mode === "create" ? "+" : "✎"}
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
                      {eyebrow}
                    </p>
                    <h2
                      id="expense-modal-heading"
                      className="text-xl font-semibold tracking-tight text-pine-2"
                    >
                      {headline}
                    </h2>
                    <p className="text-sm leading-6 text-ink/65">{description}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                  <div className="rounded-2xl border border-pine/10 bg-cream/72 px-4 py-3 text-sm text-ink/65 shadow-sm">
                    <span className="font-semibold text-pine-2">Currency</span>{" "}
                    <span className="font-mono font-semibold text-pine-2">
                      {currencyCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={MODAL_CLOSE_BTN_CLASS}
                    onClick={requestClose}
                    disabled={closeDisabled}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
            {children}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type ExpenseAttachmentRow = {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  createdAtUtcMs: number;
};

function formatAttachmentSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

function ExpenseAttachmentsPanel({
  homeId,
  expenseId,
  disabled,
  onChanged,
}: {
  homeId: string;
  expenseId: string;
  disabled: boolean;
  onChanged: () => void;
}) {
  const attId = useId();
  const [rows, setRows] = useState<ExpenseAttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/homes/${encodeURIComponent(homeId)}/expenses/${encodeURIComponent(expenseId)}/attachments`,
        );
        const j = (await res.json().catch(() => null)) as {
          attachments?: ExpenseAttachmentRow[];
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(j?.error ?? "Failed to load attachments.");
        }
        if (!cancelled) {
          setRows(j?.attachments ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load attachments.",
          );
          setRows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeId, expenseId]);

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(
          `/api/homes/${encodeURIComponent(homeId)}/expenses/${encodeURIComponent(expenseId)}/attachments`,
          { method: "POST", body: fd },
        );
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          throw new Error(j?.error ?? `Upload failed (${res.status}).`);
        }
      }
      const listRes = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/expenses/${encodeURIComponent(expenseId)}/attachments`,
      );
      const listJ = (await listRes.json().catch(() => null)) as {
        attachments?: ExpenseAttachmentRow[];
      } | null;
      if (listRes.ok) {
        setRows(listJ?.attachments ?? []);
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(id: string) {
    if (!window.confirm("Remove this attachment?")) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/expenses/${encodeURIComponent(expenseId)}/attachments/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Remove failed.");
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed.");
    }
  }

  return (
    <div className="rounded-xl border border-pine/15 bg-white/50 px-3 py-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink/45">
        Receipts
      </p>
      <p className="mt-1 text-xs text-ink/60">
        PDF, JPEG, PNG, or WEBP — up to {MAX_HOME_EXPENSE_ATTACHMENTS_PER_EXPENSE}{" "}
        files, {Math.round(MAX_HOME_EXPENSE_ATTACHMENT_FILE_BYTES / (1024 * 1024))}{" "}
        MiB each.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label
          htmlFor={`${attId}-file`}
          className="village-btn village-btn-secondary cursor-pointer text-sm"
        >
          {uploading ? "Uploading…" : "Add files"}
        </label>
        <input
          id={`${attId}-file`}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
          multiple
          className="sr-only"
          aria-label="Attach receipt files"
          disabled={disabled || uploading || loading}
          onChange={(e) => {
            void onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {loading ? <span className="text-xs text-ink/55">Loading…</span> : null}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      {rows.length === 0 && !loading ? (
        <p className="mt-2 text-sm text-ink/50">No attachments yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pine/10 bg-cream/40 px-2 py-1.5"
            >
              <a
                href={`/api/homes/${encodeURIComponent(homeId)}/expenses/${encodeURIComponent(expenseId)}/attachments/${encodeURIComponent(r.id)}`}
                className="text-[var(--highlight)] underline decoration-[color:color-mix(in_srgb,var(--highlight)_40%,transparent)] underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                {r.originalFilename}
              </a>
              <span className="text-xs text-ink/45 tabular-nums">
                {formatAttachmentSize(r.sizeBytes)}
              </span>
              <button
                type="button"
                className="text-xs text-terracotta underline underline-offset-2"
                disabled={disabled || uploading}
                onClick={() => void removeAttachment(r.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ExpenseForm({
  homeId,
  expenseId,
  expenseTypes,
  defaultCurrencyCode,
  initial,
  disabled,
  error,
  submitting,
  onAttachmentsChanged,
  onSubmit,
}: {
  homeId: string;
  expenseId?: string;
  expenseTypes: ExpenseTypeDto[];
  defaultCurrencyCode: string;
  initial?: HomeExpenseLedgerRow;
  disabled: boolean;
  error: string | null;
  submitting: boolean;
  onAttachmentsChanged: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [expenseTypeId, setExpenseTypeId] = useState(
    initial?.expenseTypeId ?? expenseTypes[0]?.id ?? "",
  );
  const [amountMajor, setAmountMajor] = useState(
    initial ? minorToMajorInput(initial.amountMinor) : "",
  );
  const [incurredOn, setIncurredOn] = useState(
    initial?.incurredOn ?? localDateInputValue(),
  );
  const [paidOn, setPaidOn] = useState(
    initial ? (initial.paidOn ?? "") : localDateInputValue(),
  );
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [invoiceReference, setInvoiceReference] = useState(
    initial?.invoiceReference ?? "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-5 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const minor = majorToMinor(amountMajor);
        if (!Number.isFinite(minor)) {
          setAmountError(
            "Enter a positive amount using dot or comma as the decimal separator.",
          );
          return;
        }
        setAmountError(null);
        const body: Record<string, unknown> = {
          expenseTypeId,
          amountMinor: minor,
          incurredOn,
          vendor: vendor.trim() || null,
          invoiceReference: invoiceReference.trim() || null,
          note: note.trim() || null,
        };
        if (paidOn.trim()) {
          body.paidOn = paidOn.trim();
        } else {
          body.paidOn = null;
        }
        onSubmit(body);
      }}
    >
      {disabled ? (
        <p className="text-sm text-terracotta">
          Add at least one expense type before recording expenses.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label className="village-label">Type</label>
        <VillageSelect
          value={expenseTypeId}
          onChange={setExpenseTypeId}
          options={expenseTypes.map((t) => ({ value: t.id, label: t.name }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="village-label">
          Amount ({defaultCurrencyCode}, major units)
        </label>
        <input
          className="village-input"
          type="text"
          inputMode="decimal"
          required
          value={amountMajor}
          onChange={(e) => {
            setAmountMajor(e.target.value);
            setAmountError(null);
          }}
          placeholder="0.00"
        />
        {amountError ? (
          <p className="text-sm text-terracotta">{amountError}</p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="village-label">Incurred on</label>
          <input
            className="village-input"
            type="date"
            required
            value={incurredOn}
            onChange={(e) => setIncurredOn(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="village-label">Paid on (optional)</label>
          <input
            className="village-input"
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="village-label">Vendor</label>
          <input
            className="village-input"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="village-label">Invoice / reference</label>
          <input
            className="village-input"
            value={invoiceReference}
            onChange={(e) => setInvoiceReference(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="village-label">Note</label>
        <textarea
          className="village-input min-h-[4rem]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {expenseId ? (
        <ExpenseAttachmentsPanel
          homeId={homeId}
          expenseId={expenseId}
          disabled={submitting}
          onChanged={onAttachmentsChanged}
        />
      ) : (
        <p className="rounded-lg border border-pine/12 bg-cream/60 px-3 py-2 text-sm text-ink/65">
          Save the expense first, then reopen <strong>Edit</strong> to attach
          PDF or image receipts (up to {MAX_HOME_EXPENSE_ATTACHMENTS_PER_EXPENSE}{" "}
          files, {Math.round(MAX_HOME_EXPENSE_ATTACHMENT_FILE_BYTES / (1024 * 1024))}{" "}
          MiB each).
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          className={MODAL_PRIMARY_BTN_CLASS}
          disabled={disabled || submitting}
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
