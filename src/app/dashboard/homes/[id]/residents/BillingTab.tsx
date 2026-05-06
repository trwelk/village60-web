"use client";

import type { ResidentMonthlyChargeListItem } from "@/lib/billing/residentCharges";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  homeId: string;
  residentId: string;
  defaultCurrencyCode: string;
};

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

function summarizeBatchPaySelection(
  billingMonths: Iterable<string>,
  charges: ResidentMonthlyChargeListItem[],
  wardMonthlyRatePerPersonMinor: number | null,
): {
  fileChargesTotalMinor: number;
  projectedMinor: number;
  totalMinor: number;
  selectedCount: number;
  unknownMonths: string[];
  alreadyPaidMonths: string[];
} {
  const byMonth = new Map(
    charges.map((c) => [
      c.billingMonth,
      { amountMinor: c.amountMinorSnapshot, paid: c.paid },
    ]),
  );
  const merged = [...new Set(billingMonths)].sort();
  let fileChargesTotalMinor = 0;
  const unknownMonths: string[] = [];
  const alreadyPaidMonths: string[] = [];
  for (const m of merged) {
    const row = byMonth.get(m);
    if (!row) {
      unknownMonths.push(m);
      continue;
    }
    if (row.paid) {
      alreadyPaidMonths.push(m);
      continue;
    }
    fileChargesTotalMinor += row.amountMinor;
  }
  const rate =
    wardMonthlyRatePerPersonMinor != null &&
    Number.isFinite(wardMonthlyRatePerPersonMinor)
      ? wardMonthlyRatePerPersonMinor
      : null;
  const projectedMinor =
    rate != null && unknownMonths.length > 0
      ? rate * unknownMonths.length
      : 0;
  return {
    fileChargesTotalMinor,
    projectedMinor,
    totalMinor: fileChargesTotalMinor + projectedMinor,
    selectedCount: merged.length,
    unknownMonths,
    alreadyPaidMonths,
  };
}

export function BillingTab({
  homeId,
  residentId,
  defaultCurrencyCode,
}: Props) {
  const [charges, setCharges] = useState<ResidentMonthlyChargeListItem[]>([]);
  const [wardMonthlyRatePerPersonMinor, setWardMonthlyRatePerPersonMinor] =
    useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [paidOnInput, setPaidOnInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPaidOn, setEditPaidOn] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedBillingMonths, setSelectedBillingMonths] = useState<Set<string>>(
    () => new Set(),
  );
  const [batchExtraMonths, setBatchExtraMonths] = useState<string[]>([]);
  const [batchExtraMonthRangeStart, setBatchExtraMonthRangeStart] = useState("");
  const [batchExtraMonthRangeEnd, setBatchExtraMonthRangeEnd] = useState("");
  const [batchPaidOn, setBatchPaidOn] = useState("");
  const [batchNotes, setBatchNotes] = useState("");
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);
  const [batchShowPaidMonths, setBatchShowPaidMonths] = useState(false);

  const [monthlyShowFilter, setMonthlyShowFilter] = useState<
    "all" | "unpaid" | "paid"
  >("all");

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    const res = await fetch(
      `/api/homes/${homeId}/residents/${residentId}/monthly-charges`,
    );
    if (!res.ok) {
      setLoadError("Could not load monthly charges.");
      setLoading(false);
      return;
    }
    const data: unknown = await res.json();
    const obj =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : {};
    const list = Array.isArray(obj.charges)
      ? (obj.charges as ResidentMonthlyChargeListItem[])
      : [];
    setCharges(list);
    const rateRaw = obj.wardMonthlyRatePerPersonMinor;
    setWardMonthlyRatePerPersonMinor(
      typeof rateRaw === "number" &&
        Number.isFinite(rateRaw) &&
        Number.isInteger(rateRaw)
        ? rateRaw
        : null,
    );
    setLoading(false);
  }, [homeId, residentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function parseError(res: Response): Promise<string> {
    try {
      const data: unknown = await res.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
      ) {
        const msg = (data as { error: string; month?: string }).error;
        const m = (data as { month?: unknown }).month;
        if (typeof m === "string" && m.length > 0) {
          return `${msg} (${m})`;
        }
        return msg;
      }
    } catch {
      /* ignore */
    }
    return "Request failed.";
  }

  function startRecord(c: ResidentMonthlyChargeListItem) {
    setActionError(null);
    setRecordingId(c.id);
    setPaidOnInput("");
    setNotesInput("");
  }

  function cancelRecord() {
    setRecordingId(null);
    setPaidOnInput("");
    setNotesInput("");
  }

  async function submitRecord(c: ResidentMonthlyChargeListItem) {
    setActionError(null);
    const res = await fetch(
      `/api/homes/${homeId}/residents/${residentId}/monthly-charges/${c.id}/payment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor: c.amountMinorSnapshot,
          paidOn: paidOnInput.trim(),
          notes: notesInput.trim() === "" ? null : notesInput.trim(),
        }),
      },
    );
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    cancelRecord();
    await load();
  }

  function startEdit(c: ResidentMonthlyChargeListItem) {
    if (!c.payment) return;
    setActionError(null);
    setEditingId(c.id);
    setEditPaidOn(c.payment.paidOn);
    setEditNotes(c.payment.notes ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPaidOn("");
    setEditNotes("");
  }

  async function saveEdit(c: ResidentMonthlyChargeListItem) {
    setActionError(null);
    const res = await fetch(
      `/api/homes/${homeId}/residents/${residentId}/monthly-charges/${c.id}/payment`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidOn: editPaidOn.trim(),
          notes: editNotes.trim() === "" ? null : editNotes.trim(),
        }),
      },
    );
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    cancelEdit();
    await load();
  }

  const openBatchPay = useCallback(() => {
    setActionError(null);
    setBatchSuccess(null);
    setBatchOpen(true);
    setSelectedBillingMonths(
      new Set(charges.filter((c) => !c.paid).map((c) => c.billingMonth)),
    );
    setBatchExtraMonths([]);
    setBatchExtraMonthRangeStart("");
    setBatchExtraMonthRangeEnd("");
    setBatchPaidOn("");
    setBatchNotes("");
    setBatchShowPaidMonths(false);
  }, [charges]);

  const cancelBatchPay = useCallback(() => {
    setBatchOpen(false);
    setBatchExtraMonths([]);
    setBatchExtraMonthRangeStart("");
    setBatchExtraMonthRangeEnd("");
    setBatchPaidOn("");
    setBatchNotes("");
  }, []);

  useEffect(() => {
    if (!batchOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelBatchPay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [batchOpen, cancelBatchPay]);

  function toggleBatchMonth(billingMonth: string, checked: boolean) {
    setSelectedBillingMonths((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(billingMonth);
      } else {
        next.delete(billingMonth);
      }
      return next;
    });
  }

  function removeBatchExtraMonth(month: string) {
    setBatchExtraMonths((prev) => prev.filter((m) => m !== month));
  }

  function addBatchExtraMonthRange() {
    const start = batchExtraMonthRangeStart.trim();
    const end = batchExtraMonthRangeEnd.trim();
    if (!/^\d{4}-\d{2}$/u.test(start) || !/^\d{4}-\d{2}$/u.test(end)) {
      setActionError("Select both range months in UTC format (YYYY-MM).");
      return;
    }
    if (start > end) {
      setActionError("Range start month must be before or equal to end month.");
      return;
    }
    const [startYear, startMonth] = start.split("-").map(Number);
    const [endYear, endMonth] = end.split("-").map(Number);
    const months: string[] = [];
    let year = startYear;
    let month = startMonth;
    while (year < endYear || (year === endYear && month <= endMonth)) {
      months.push(`${year}-${String(month).padStart(2, "0")}`);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    setActionError(null);
    setBatchExtraMonths((prev) => [...new Set([...prev, ...months])].sort());
  }

  async function submitBatchPay() {
    setActionError(null);
    setBatchSuccess(null);
    const merged = new Set([...selectedBillingMonths, ...batchExtraMonths]);
    if (merged.size === 0) {
      setActionError(
        "Select at least one billing month or add a month range (UTC, YYYY-MM).",
      );
      return;
    }
    setBatchSubmitting(true);
    const res = await fetch(
      `/api/homes/${homeId}/residents/${residentId}/monthly-charges/pay-billing-months`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingMonths: [...merged],
          paidOn: batchPaidOn.trim() === "" ? "" : batchPaidOn.trim(),
          notes: batchNotes.trim() === "" ? null : batchNotes.trim(),
        }),
      },
    );
    setBatchSubmitting(false);
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    cancelBatchPay();
    setBatchSuccess("Payments recorded for the selected month(s).");
    await load();
  }

  async function removePayment(c: ResidentMonthlyChargeListItem) {
    if (!c.payment) return;
    if (
      !globalThis.confirm(
        "Remove this payment record? The month will show as unpaid.",
      )
    ) {
      return;
    }
    setActionError(null);
    const res = await fetch(
      `/api/homes/${homeId}/residents/${residentId}/monthly-charges/${c.id}/payment`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    await load();
  }

  const visibleMonthlyCharges =
    monthlyShowFilter === "unpaid"
      ? charges.filter((c) => !c.paid)
      : monthlyShowFilter === "paid"
        ? charges.filter((c) => c.paid)
        : charges;

  const batchChargesForList = batchShowPaidMonths
    ? charges
    : charges.filter((c) => !c.paid);

  const batchPaySummary = batchOpen
    ? summarizeBatchPaySelection(
        new Set([...selectedBillingMonths, ...batchExtraMonths]),
        charges,
        wardMonthlyRatePerPersonMinor,
      )
    : {
        fileChargesTotalMinor: 0,
        projectedMinor: 0,
        totalMinor: 0,
        selectedCount: 0,
        unknownMonths: [] as string[],
        alreadyPaidMonths: [] as string[],
      };

  const batchPaidHiddenCount = charges.filter((c) => c.paid).length;

  if (loading) {
    return (
      <div className="village-panel-card px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-sm space-y-3">
          <div className="h-2 w-28 animate-pulse rounded-full bg-[color:color-mix(in_srgb,var(--line-subtle)_55%,transparent)]" />
          <div className="h-4 w-full animate-pulse rounded-md bg-[color:color-mix(in_srgb,var(--bg-muted)_72%,var(--bg-elevated)_28%)]" />
          <div className="h-4 w-[80%] animate-pulse rounded-md bg-[color:color-mix(in_srgb,var(--bg-muted)_72%,var(--bg-elevated)_28%)]" />
          <p className="pt-2 text-center text-sm text-[var(--text-secondary)]">
            Loading monthly charges…
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return <p className="village-alert-error">{loadError}</p>;
  }

  return (
    <div className="village-panel-card overflow-hidden">
      <header className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_18%,var(--bg-elevated)_82%)] px-5 py-4 sm:px-6">
        <p className="village-kicker mb-2">Billing</p>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[1.35rem]">
              Monthly charges
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Ward amounts by UTC month. Record payments individually or in one
              batch when a resident pays multiple months at once.
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-5 py-5 sm:px-6 sm:py-6">
      {batchSuccess ? (
        <div
          className="rounded-[var(--radius-md)] border border-[color:color-mix(in_srgb,var(--success)_38%,transparent)] bg-success-muted px-4 py-3 text-sm font-medium text-success"
          data-testid="billing-batch-success"
        >
          {batchSuccess}
        </div>
      ) : null}
      {actionError ? <p className="village-alert-error">{actionError}</p> : null}

      <div
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        data-testid="billing-month-filter"
      >
        {charges.length > 0 ? (
          <div
            role="group"
            aria-label="Filter months by payment status"
            className="inline-flex w-full max-w-xl gap-0.5 rounded-[var(--radius-lg)] border border-[color:color-mix(in_srgb,var(--line-subtle)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_42%,var(--bg-elevated)_58%)] p-1 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_68%,transparent)] sm:w-auto"
          >
            {(
              [
                ["all", "All"],
                ["unpaid", "Unpaid"],
                ["paid", "Paid"],
              ] as const
            ).map(([value, label]) => {
              const selected = monthlyShowFilter === value;
              return (
                <label
                  key={value}
                  className={[
                    "flex min-h-11 min-w-0 flex-1 cursor-pointer select-none items-center justify-center rounded-[calc(var(--radius-md)-3px)] px-3 py-2 text-center text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-150",
                    "focus-within:ring-2 focus-within:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] focus-within:ring-offset-2 focus-within:ring-offset-[color:color-mix(in_srgb,var(--bg-muted)_42%,var(--bg-elevated)_58%)] focus-within:outline-none",
                    selected
                      ? "bg-[var(--accent-strong)] text-[var(--bg-elevated)] shadow-[0_1px_3px_-1px_color-mix(in_srgb,var(--accent-strong)_35%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--highlight)_28%,transparent)] ring-1 ring-[color:color-mix(in_srgb,var(--accent-strong)_55%,transparent)]"
                      : "text-[var(--text-secondary)] hover:bg-[color:color-mix(in_srgb,var(--bg-elevated)_52%,transparent)] hover:text-[var(--text-primary)] active:scale-[0.99]",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="billing-monthly-filter"
                    className="sr-only border-0 focus:outline-none focus:ring-0"
                    checked={selected}
                    onChange={() => setMonthlyShowFilter(value)}
                  />
                  <span className={selected ? "font-semibold" : ""}>
                    {label}
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}
        <button
          type="button"
          className="village-btn-primary shrink-0 px-4 py-2 text-sm sm:ml-auto"
          onClick={openBatchPay}
        >
          Pay multiple months
        </button>
      </div>

      {charges.length === 0 ? (
        <div className="village-card-soft py-10 text-center">
          <p className="text-base font-semibold text-[var(--text-primary)]">
            No monthly charges yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
            Charges for this resident will show up here after monthly billing
            generates rows. You can still use batch pay to add months by range if
            needed.
          </p>
        </div>
      ) : (
        <>
          {visibleMonthlyCharges.length === 0 ? (
            <div
              className="village-card-soft py-8 text-center"
              data-testid="billing-monthly-filter-empty"
            >
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                No months match this filter
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
                Try switching to{" "}
                <span className="font-medium text-[var(--text-primary)]">All</span>{" "}
                or adjust paid vs. unpaid.
              </p>
            </div>
          ) : (
        <div className="village-table-wrap mt-1">
          <table
            data-testid="billing-monthly-charges-table"
            className="village-table"
          >
            <thead className="village-thead">
              <tr>
                <th className="village-th">Month (UTC)</th>
                <th className="village-th">Ward (snapshot)</th>
                <th className="village-th">Amount</th>
                <th className="village-th">Status</th>
                <th className="village-th">Actions</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {visibleMonthlyCharges.map((c) => (
                <tr
                  key={c.id}
                  className="transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--partner-green)_6%,var(--bg-elevated)_94%)]"
                >
                  <td className="village-td font-mono text-[0.8125rem] font-semibold tracking-tight text-[var(--text-primary)]">
                    {c.billingMonth}
                  </td>
                  <td className="village-td-muted text-sm">
                    {c.wardLabel ?? "—"}
                  </td>
                  <td className="village-td-muted">
                    <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                      {formatMinorAsCurrency(
                        c.amountMinorSnapshot,
                        defaultCurrencyCode,
                      )}
                    </span>
                    <span className="mt-0.5 block font-mono text-[0.7rem] tabular-nums text-[var(--text-muted)]">
                      {c.amountMinorSnapshot} minor
                    </span>
                  </td>
                  <td className="village-td-muted">
                    {c.paid ? (
                      <span className="inline-flex items-center rounded-full border border-[color:color-mix(in_srgb,var(--success)_40%,transparent)] bg-success-muted px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.04em] text-success">
                        Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-[color:color-mix(in_srgb,var(--accent-strong)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--bg-elevated)_90%)] px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.04em] text-[var(--accent-strong)]">
                        Unpaid
                      </span>
                    )}
                  </td>
                  <td className="village-td">
                    {!c.paid && recordingId !== c.id ? (
                      <button
                        type="button"
                        className="village-btn-secondary px-3.5 py-1.5 text-xs font-semibold"
                        onClick={() => startRecord(c)}
                      >
                        Record payment
                      </button>
                    ) : null}
                    {!c.paid && recordingId === c.id ? (
                      <div className="village-card-soft flex min-w-[14rem] flex-col gap-3">
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Paid on</span>
                          <input
                            className="village-input"
                            type="date"
                            value={paidOnInput}
                            onChange={(e) => setPaidOnInput(e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Notes</span>
                          <input
                            className="village-input"
                            value={notesInput}
                            onChange={(e) => setNotesInput(e.target.value)}
                            placeholder="optional"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="village-btn-primary px-3 py-1 text-xs"
                            onClick={() => void submitRecord(c)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="village-btn-secondary px-3 py-1 text-xs"
                            onClick={cancelRecord}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {c.paid && c.payment && editingId !== c.id ? (
                      <div className="flex max-w-[16rem] flex-col gap-1">
                        <p className="text-[0.75rem] leading-snug text-[var(--text-secondary)]">
                          Paid on{" "}
                          <time
                            dateTime={c.payment.paidOn}
                            className="font-mono text-[0.8125rem] font-semibold tabular-nums text-[var(--text-primary)]"
                          >
                            {c.payment.paidOn}
                          </time>
                        </p>
                        {c.payment.notes ? (
                          <p
                            className="line-clamp-2 text-[0.72rem] leading-snug text-[var(--text-muted)]"
                            title={c.payment.notes}
                          >
                            {c.payment.notes}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
                          <button
                            type="button"
                            className="village-link cursor-pointer border-0 bg-transparent p-0 text-[0.78rem] font-semibold"
                            onClick={() => startEdit(c)}
                          >
                            Edit
                          </button>
                          <span
                            className="select-none text-[0.6rem] font-medium text-[var(--text-muted)]"
                            aria-hidden
                          >
                            ·
                          </span>
                          <button
                            type="button"
                            className="cursor-pointer border-0 bg-transparent p-0 text-[0.78rem] font-semibold text-[var(--danger)] underline decoration-[color:color-mix(in_srgb,var(--danger)_38%,transparent)] underline-offset-[3px] transition hover:text-[color-mix(in_srgb,var(--danger)_88%,var(--text-primary)_12%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--danger)_32%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)]"
                            onClick={() => void removePayment(c)}
                          >
                            Remove payment
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {c.paid && editingId === c.id ? (
                      <div className="village-card-soft flex min-w-[14rem] flex-col gap-3">
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Paid on</span>
                          <input
                            className="village-input"
                            type="date"
                            value={editPaidOn}
                            onChange={(e) => setEditPaidOn(e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Notes</span>
                          <input
                            className="village-input"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="village-btn-primary px-3 py-1 text-xs"
                            onClick={() => void saveEdit(c)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="village-btn-secondary px-3 py-1 text-xs"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}

      </div>

      {batchOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
          <button
            type="button"
            className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
            aria-label="Dismiss batch payment dialog"
            onClick={cancelBatchPay}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="billing-batch-modal-title"
            data-testid="billing-batch-panel"
            className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-2xl flex-col rounded-t-[var(--radius-xl)] border border-[color:color-mix(in_srgb,var(--line-strong)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_30%,var(--bg-elevated)_70%)] shadow-[0_-12px_48px_-14px_color-mix(in_srgb,var(--text-primary)_32%,transparent)] sm:max-h-[min(90dvh,52rem)] sm:rounded-[var(--radius-xl)] sm:shadow-[var(--shadow-lg)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] px-4 py-4 sm:px-6">
              <div className="min-w-0 pr-2">
                <p className="village-kicker mb-1.5">Batch action</p>
                <h2
                  id="billing-batch-modal-title"
                  className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)]"
                >
                  Record batch payment
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Select months, optionally add a range, then confirm the total.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--line-subtle)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text-secondary)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_75%,transparent)] transition hover:border-[color:color-mix(in_srgb,var(--accent)_28%,var(--line-strong))] hover:text-[var(--text-primary)]"
                onClick={cancelBatchPay}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              One transaction materializes missing rows for active residents (when
              allowed), then records a full payment for each selected UTC month. Leave{" "}
              <span className="font-medium text-[var(--text-primary)]">Paid on</span>{" "}
              empty to use today’s UTC date.
            </p>

            {charges.length > 0 ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="village-field-label text-[0.8rem]">
                    Months to pay
                  </span>
                  {batchPaidHiddenCount > 0 ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-pine underline decoration-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] underline-offset-2 hover:text-[var(--accent-strong)]"
                      onClick={() => setBatchShowPaidMonths((v) => !v)}
                    >
                      {batchShowPaidMonths
                        ? "Hide paid months"
                        : `Show paid months (${batchPaidHiddenCount})`}
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 overflow-hidden rounded-lg border border-[color:color-mix(in_srgb,var(--line-subtle)_78%,transparent)] bg-[var(--bg-elevated)]">
                  <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_28%,var(--bg-elevated)_72%)] px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                    <span className="sr-only">Select</span>
                    <span>Month (UTC)</span>
                    <span className="text-right">Amount</span>
                  </div>
                  <ul className="divide-y divide-[color:color-mix(in_srgb,var(--line-subtle)_65%,transparent)] text-sm">
                    {batchChargesForList.map((c) => (
                      <li key={c.id}>
                        <label
                          className={[
                            "grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3 py-2.5 transition-colors hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_40%,transparent)]",
                            c.paid ? "cursor-default text-ink/45" : "",
                          ].join(" ")}
                        >
                          <input
                            type="checkbox"
                            className="village-checkbox h-4 w-4 shrink-0"
                            disabled={c.paid}
                            checked={
                              c.paid ? false : selectedBillingMonths.has(c.billingMonth)
                            }
                            onChange={(e) => {
                              toggleBatchMonth(c.billingMonth, e.target.checked);
                            }}
                          />
                          <span className="min-w-0 font-mono text-[0.8125rem]">
                            {c.billingMonth}
                            {c.paid ? (
                              <span className="ml-1.5 font-sans text-xs font-normal text-ink/45">
                                (paid)
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-[var(--text-primary)]">
                            {formatMinorAsCurrency(
                              c.amountMinorSnapshot,
                              defaultCurrencyCode,
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                {!batchShowPaidMonths && batchChargesForList.length === 0 ? (
                  <p className="mt-2 text-sm text-ink/65">
                    No unpaid months in this list. Use{" "}
                    <button
                      type="button"
                      className="font-semibold text-pine underline"
                      onClick={() => setBatchShowPaidMonths(true)}
                    >
                      Show paid months
                    </button>{" "}
                    or add a month range below.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 rounded-lg border border-[color:color-mix(in_srgb,var(--line-subtle)_78%,transparent)] bg-[var(--bg-elevated)] p-4">
              <span className="village-field-label text-[0.8rem]">
                Add months not listed above
              </span>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Month range in UTC (<span className="font-mono">YYYY-MM</span>).
                Use the same month for both fields to add a single month.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[0.65rem] font-medium uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                      From
                    </span>
                    <input
                      className="village-input w-full min-w-0"
                      type="month"
                      value={batchExtraMonthRangeStart}
                      onChange={(e) => setBatchExtraMonthRangeStart(e.target.value)}
                    />
                  </label>
                  <span className="-my-1 flex justify-center text-xs font-medium text-[var(--text-secondary)] sm:my-0 sm:pb-2.5">
                    to
                  </span>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[0.65rem] font-medium uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                      To
                    </span>
                    <input
                      className="village-input w-full min-w-0"
                      type="month"
                      value={batchExtraMonthRangeEnd}
                      onChange={(e) => setBatchExtraMonthRangeEnd(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="village-btn-primary w-full shrink-0 px-3 py-2 text-sm sm:w-auto sm:self-end"
                  onClick={addBatchExtraMonthRange}
                >
                  Add range
                </button>
              </div>
              {batchExtraMonths.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_65%,transparent)] pt-3">
                  {batchExtraMonths.map((month) => (
                    <button
                      key={month}
                      type="button"
                      className="rounded-full border border-ink/18 bg-[color:color-mix(in_srgb,var(--bg-muted)_30%,transparent)] px-2.5 py-1 font-mono text-xs font-medium text-[var(--text-primary)] transition hover:border-ink/28 hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_45%,transparent)]"
                      onClick={() => removeBatchExtraMonth(month)}
                      title="Remove month"
                    >
                      {month} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="village-field-label">Paid on (optional)</span>
                <input
                  className="village-input"
                  type="date"
                  value={batchPaidOn}
                  onChange={(e) => setBatchPaidOn(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                <span className="village-field-label">Notes (optional, shared)</span>
                <input
                  className="village-input"
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  placeholder="optional"
                />
              </label>
            </div>

            </div>

            <div className="shrink-0 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_22%,var(--bg-elevated)_78%)] px-4 py-3 sm:px-5">
            <div
              className="flex flex-col gap-4 rounded-lg border border-[color:color-mix(in_srgb,var(--accent)_22%,var(--line-strong))] bg-[color:color-mix(in_srgb,var(--accent)_6%,var(--bg-elevated)_94%)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid="billing-batch-total"
            >
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.07em] text-[var(--text-secondary)]">
                  Total payment
                </p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
                  {batchPaySummary.selectedCount === 0
                    ? "—"
                    : formatMinorAsCurrency(
                        batchPaySummary.totalMinor,
                        defaultCurrencyCode,
                      )}
                </p>
                {batchPaySummary.selectedCount > 0 ? (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {batchPaySummary.selectedCount === 1
                      ? "1 month selected"
                      : `${batchPaySummary.selectedCount} months selected`}
                    {batchPaySummary.fileChargesTotalMinor > 0 ||
                    batchPaySummary.projectedMinor > 0 ? (
                      <span>
                        {" "}
                        ·{" "}
                        {batchPaySummary.fileChargesTotalMinor > 0 ? (
                          <>
                            {batchPaySummary.fileChargesTotalMinor.toLocaleString()}{" "}
                            minor from charges on file
                          </>
                        ) : null}
                        {batchPaySummary.fileChargesTotalMinor > 0 &&
                        batchPaySummary.projectedMinor > 0
                          ? "; "
                          : null}
                        {batchPaySummary.projectedMinor > 0 ? (
                          <>
                            {batchPaySummary.projectedMinor.toLocaleString()} minor
                            projected ({batchPaySummary.unknownMonths.length}{" "}
                            month
                            {batchPaySummary.unknownMonths.length === 1
                              ? ""
                              : "s"}{" "}
                            × current ward rate)
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Select months above or add a range.
                  </p>
                )}
                {batchPaySummary.unknownMonths.length > 0 &&
                wardMonthlyRatePerPersonMinor == null ? (
                  <p className="mt-2 text-xs leading-snug text-terracotta">
                    {batchPaySummary.unknownMonths.length} month
                    {batchPaySummary.unknownMonths.length === 1 ? "" : "s"} not in
                    this list yet—assign a ward with a monthly rate to project
                    amounts, or create charges first:{" "}
                    <span className="font-mono">
                      {batchPaySummary.unknownMonths.join(", ")}
                    </span>
                  </p>
                ) : null}
                {batchPaySummary.unknownMonths.length > 0 &&
                wardMonthlyRatePerPersonMinor != null ? (
                  <p className="mt-2 text-xs leading-snug text-[var(--text-secondary)]">
                    Month(s) not on file yet are included at the current ward rate (
                    {formatMinorAsCurrency(
                      wardMonthlyRatePerPersonMinor,
                      defaultCurrencyCode,
                    )}
                    /mo):{" "}
                    <span className="font-mono">
                      {batchPaySummary.unknownMonths.join(", ")}
                    </span>
                  </p>
                ) : null}
                {batchPaySummary.alreadyPaidMonths.length > 0 ? (
                  <p className="mt-2 text-xs leading-snug text-ink/65">
                    Included paid month(s) (server may reject):{" "}
                    <span className="font-mono">
                      {batchPaySummary.alreadyPaidMonths.join(", ")}
                    </span>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="village-btn-primary w-full shrink-0 px-5 py-2.5 text-sm font-semibold sm:w-auto"
                disabled={batchSubmitting}
                onClick={() => void submitBatchPay()}
              >
                {batchSubmitting ? "Saving…" : "Record batch payment"}
              </button>
            </div>
            </div>
          </div>
        </div>,
            document.body,
          )
        : null}

    </div>
  );
}
