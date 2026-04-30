"use client";

import type { ResidentMonthlyChargeListItem } from "@/lib/billing/residentCharges";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

export function BillingTab({
  homeId,
  residentId,
  defaultCurrencyCode,
}: Props) {
  const [charges, setCharges] = useState<ResidentMonthlyChargeListItem[]>([]);
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
  const [batchExtraMonthInput, setBatchExtraMonthInput] = useState("");
  const [batchExtraMonthRangeStart, setBatchExtraMonthRangeStart] = useState("");
  const [batchExtraMonthRangeEnd, setBatchExtraMonthRangeEnd] = useState("");
  const [batchPaidOn, setBatchPaidOn] = useState("");
  const [batchNotes, setBatchNotes] = useState("");
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);

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
    const list =
      typeof data === "object" &&
      data !== null &&
      "charges" in data &&
      Array.isArray((data as { charges: unknown }).charges)
        ? (data as { charges: ResidentMonthlyChargeListItem[] }).charges
        : [];
    setCharges(list);
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

  function openBatchPay() {
    setActionError(null);
    setBatchSuccess(null);
    setBatchOpen(true);
    setSelectedBillingMonths(
      new Set(charges.filter((c) => !c.paid).map((c) => c.billingMonth)),
    );
    setBatchExtraMonths([]);
    setBatchExtraMonthInput("");
    setBatchExtraMonthRangeStart("");
    setBatchExtraMonthRangeEnd("");
    setBatchPaidOn("");
    setBatchNotes("");
  }

  function cancelBatchPay() {
    setBatchOpen(false);
    setBatchExtraMonths([]);
    setBatchExtraMonthInput("");
    setBatchExtraMonthRangeStart("");
    setBatchExtraMonthRangeEnd("");
    setBatchPaidOn("");
    setBatchNotes("");
  }

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

  function addBatchExtraMonth() {
    const month = batchExtraMonthInput.trim();
    if (!/^\d{4}-\d{2}$/u.test(month)) {
      setActionError("Select a valid month (UTC, YYYY-MM).");
      return;
    }
    setActionError(null);
    setBatchExtraMonths((prev) =>
      prev.includes(month) ? prev : [...prev, month].sort(),
    );
    setBatchExtraMonthInput("");
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
      setActionError("Select or enter at least one billing month (UTC, YYYY-MM).");
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

  if (loading) {
    return (
      <div className="text-sm text-ink/70">Loading monthly charges…</div>
    );
  }

  if (loadError) {
    return <p className="village-alert-error">{loadError}</p>;
  }

  const visibleMonthlyCharges =
    monthlyShowFilter === "unpaid"
      ? charges.filter((c) => !c.paid)
      : monthlyShowFilter === "paid"
        ? charges.filter((c) => c.paid)
        : charges;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="village-section-title">Monthly billing</h3>
        <p className="mt-2 text-sm text-ink/70">
          Charges are created by the monthly job (UTC). Payments must match the
          full charge amount in {defaultCurrencyCode} minor units (e.g. cents).
        </p>
        <p className="mt-2 text-sm">
          <Link
            href={`/dashboard/homes/${homeId}/residents/${residentId}?tab=other-charge`}
            className="village-link-subtle font-semibold text-pine underline"
            data-testid="billing-link-other-charges"
          >
            Other charges (registration, deposit)
          </Link>
        </p>
        <div className="mt-3">
          <button
            type="button"
            className="village-btn-secondary px-3 py-1.5 text-sm"
            onClick={() => (batchOpen ? cancelBatchPay() : openBatchPay())}
          >
            {batchOpen ? "Close batch pay" : "Pay multiple months"}
          </button>
        </div>
        {batchOpen ? (
          <div
            data-testid="billing-batch-panel"
            className="mt-4 rounded-lg border border-ink/15 bg-ink/[0.03] p-4"
          >
            <p className="text-sm text-ink/80">
              One transaction: materializes missing rows for active residents (when
              allowed), then records a full payment for each selected UTC month. Leave
              paid on empty to use today’s UTC date.
            </p>
            {charges.length > 0 ? (
              <ul className="mt-3 flex max-h-40 flex-col gap-2 overflow-y-auto text-sm">
                {charges.map((c) => (
                  <li key={c.id}>
                    <label
                      className={
                        c.paid
                          ? "flex items-center gap-2 text-ink/50"
                          : "flex cursor-pointer items-center gap-2"
                      }
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        disabled={c.paid}
                        checked={c.paid ? false : selectedBillingMonths.has(c.billingMonth)}
                        onChange={(e) => {
                          toggleBatchMonth(c.billingMonth, e.target.checked);
                        }}
                      />
                      <span>
                        {c.billingMonth}
                        {c.paid ? (
                          <span className="ml-1 text-ink/50">(already paid)</span>
                        ) : null}
                        {" — "}
                        {formatMinorAsCurrency(
                          c.amountMinorSnapshot,
                          defaultCurrencyCode,
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="mt-3 flex flex-col gap-1 text-xs">
              <span className="village-field-label">
                Additional months (optional)
              </span>
              <div className="flex max-w-md gap-2">
                <input
                  className="village-input"
                  type="month"
                  value={batchExtraMonthInput}
                  onChange={(e) => setBatchExtraMonthInput(e.target.value)}
                />
                <button
                  type="button"
                  className="village-btn-secondary px-3 py-1.5 text-sm"
                  onClick={addBatchExtraMonth}
                >
                  Add
                </button>
              </div>
              <div className="mt-2 grid max-w-md gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  className="village-input"
                  type="month"
                  value={batchExtraMonthRangeStart}
                  onChange={(e) => setBatchExtraMonthRangeStart(e.target.value)}
                />
                <input
                  className="village-input"
                  type="month"
                  value={batchExtraMonthRangeEnd}
                  onChange={(e) => setBatchExtraMonthRangeEnd(e.target.value)}
                />
                <button
                  type="button"
                  className="village-btn-secondary px-3 py-1.5 text-sm"
                  onClick={addBatchExtraMonthRange}
                >
                  Add range
                </button>
              </div>
              {batchExtraMonths.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {batchExtraMonths.map((month) => (
                    <button
                      key={month}
                      type="button"
                      className="rounded-full border border-ink/20 bg-ink/[0.04] px-2 py-1 font-mono text-xs text-ink/80"
                      onClick={() => removeBatchExtraMonth(month)}
                      title="Remove month"
                    >
                      {month} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
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
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="village-btn-primary px-3 py-1.5 text-sm"
                disabled={batchSubmitting}
                onClick={() => void submitBatchPay()}
              >
                {batchSubmitting ? "Saving…" : "Record batch payment"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {batchSuccess ? (
        <p className="text-sm text-success" data-testid="billing-batch-success">
          {batchSuccess}
        </p>
      ) : null}
      {actionError ? <p className="village-alert-error">{actionError}</p> : null}

      {charges.length === 0 ? (
        <p className="text-sm text-ink/65">
          No monthly charges yet for this resident.
        </p>
      ) : (
        <>
          <fieldset className="mt-4 border-0 p-0">
            <legend className="text-sm font-medium text-ink">Show months</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  className="h-4 w-4"
                  name="billing-monthly-filter"
                  checked={monthlyShowFilter === "all"}
                  onChange={() => setMonthlyShowFilter("all")}
                />
                All
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  className="h-4 w-4"
                  name="billing-monthly-filter"
                  checked={monthlyShowFilter === "unpaid"}
                  onChange={() => setMonthlyShowFilter("unpaid")}
                />
                Unpaid only
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  className="h-4 w-4"
                  name="billing-monthly-filter"
                  checked={monthlyShowFilter === "paid"}
                  onChange={() => setMonthlyShowFilter("paid")}
                />
                Paid only
              </label>
            </div>
          </fieldset>
          {visibleMonthlyCharges.length === 0 ? (
            <p
              className="mt-3 text-sm text-ink/65"
              data-testid="billing-monthly-filter-empty"
            >
              No months match this filter.
            </p>
          ) : (
        <div className="village-table-wrap mt-3">
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
                <tr key={c.id}>
                  <td className="village-td font-medium">{c.billingMonth}</td>
                  <td className="village-td-muted text-sm">
                    {c.wardLabel ?? "—"}
                  </td>
                  <td className="village-td-muted">
                    <span className="font-medium text-ink">
                      {formatMinorAsCurrency(
                        c.amountMinorSnapshot,
                        defaultCurrencyCode,
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink/60">
                      {c.amountMinorSnapshot} minor
                    </span>
                  </td>
                  <td className="village-td-muted">
                    {c.paid ? (
                      <span className="text-pine font-medium">Paid</span>
                    ) : (
                      <span className="text-terracotta font-medium">Unpaid</span>
                    )}
                  </td>
                  <td className="village-td">
                    {!c.paid && recordingId !== c.id ? (
                      <button
                        type="button"
                        className="village-btn-primary px-3 py-1.5 text-xs"
                        onClick={() => startRecord(c)}
                      >
                        Record payment
                      </button>
                    ) : null}
                    {!c.paid && recordingId === c.id ? (
                      <div className="flex min-w-[14rem] flex-col gap-2">
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
                      <div className="flex flex-col gap-1 text-xs text-ink/80">
                        <span>Paid {c.payment.paidOn}</span>
                        {c.payment.notes ? (
                          <span className="text-ink/65">{c.payment.notes}</span>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="village-link cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-pine underline"
                            onClick={() => startEdit(c)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-sm font-semibold text-danger underline"
                            onClick={() => void removePayment(c)}
                          >
                            Delete payment
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {c.paid && editingId === c.id ? (
                      <div className="flex min-w-[14rem] flex-col gap-2">
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
  );
}
