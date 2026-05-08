"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

const MODAL_PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,#c2410c_78%,transparent)] bg-gradient-to-br from-[#fdba74] to-[#ea580c] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,#fef3c7_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,#c2410c_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100 min-h-10";
const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

type Props = {
  homeId: string;
  residentId: string;
  defaultCurrencyCode: string;
};

type LedgerTxn = {
  id: string;
  accountId: string;
  txnType: string;
  amountMinor: number;
  sourceKind: string;
  sourceId: string | null;
  memo: string | null;
  recordedByUserId: string | null;
  postedAtUtcMs: number;
  reversesTransactionId?: string | null;
};

type StatementLine = {
  transaction: LedgerTxn;
  runningBalanceMinor: number;
};

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

function shortLedgerId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

async function parseError(res: Response): Promise<string> {
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
    // ignore
  }
  return "Request failed.";
}

function isLedgerTxn(value: unknown): value is LedgerTxn {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.accountId === "string" &&
    typeof o.txnType === "string" &&
    typeof o.amountMinor === "number" &&
    typeof o.sourceKind === "string" &&
    (o.sourceId === null || typeof o.sourceId === "string") &&
    (o.memo === null || typeof o.memo === "string") &&
    (o.recordedByUserId === null || typeof o.recordedByUserId === "string") &&
    typeof o.postedAtUtcMs === "number" &&
    (o.reversesTransactionId === undefined ||
      o.reversesTransactionId === null ||
      typeof o.reversesTransactionId === "string")
  );
}

function parseStatement(data: unknown): {
  accountId: string;
  currentBalanceMinor: number;
  lines: StatementLine[];
} | null {
  if (typeof data !== "object" || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.accountId !== "string" || typeof rec.currentBalanceMinor !== "number") {
    return null;
  }
  if (!Array.isArray(rec.lines)) return null;
  const lines: StatementLine[] = [];
  for (const row of rec.lines) {
    if (typeof row !== "object" || row === null) return null;
    const line = row as Record<string, unknown>;
    if (
      typeof line.runningBalanceMinor !== "number" ||
      !isLedgerTxn(line.transaction)
    ) {
      return null;
    }
    lines.push({
      transaction: line.transaction,
      runningBalanceMinor: line.runningBalanceMinor,
    });
  }
  return {
    accountId: rec.accountId,
    currentBalanceMinor: rec.currentBalanceMinor,
    lines,
  };
}

type StatementData = NonNullable<ReturnType<typeof parseStatement>>;

async function loadBillingStatement(
  homeId: string,
  residentId: string,
): Promise<
  | { ok: true; data: StatementData }
  | { ok: false; errorMessage: string }
> {
  const res = await fetch(
    `/api/homes/${homeId}/residents/${residentId}/billing-statement`,
  );
  if (!res.ok) {
    return { ok: false, errorMessage: await parseError(res) };
  }
  const data: unknown = await res.json();
  const parsed = parseStatement(data);
  if (!parsed) {
    return { ok: false, errorMessage: "Unexpected statement response." };
  }
  return { ok: true, data: parsed };
}

export function BillingLedgerPanel({
  homeId,
  residentId,
  defaultCurrencyCode,
}: Props) {
  const [statement, setStatement] = useState<{
    accountId: string;
    currentBalanceMinor: number;
    lines: StatementLine[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amountMinorStr, setAmountMinorStr] = useState("");
  const [receivedOn, setReceivedOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState("transfer");
  const [externalRef, setExternalRef] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadBillingStatement(homeId, residentId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setStatement(result.data);
        setError(null);
      } else {
        setStatement(null);
        setError(result.errorMessage);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [homeId, residentId]);

  const reversedOriginalIds = useMemo(() => {
    if (!statement) {
      return new Set<string>();
    }
    const ids = new Set<string>();
    for (const { transaction: t } of statement.lines) {
      if (t.txnType === "reversal" && t.reversesTransactionId) {
        ids.add(t.reversesTransactionId);
      }
    }
    return ids;
  }, [statement]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadBillingStatement(homeId, residentId);
    if (result.ok) {
      setStatement(result.data);
      setError(null);
    } else {
      setStatement(null);
      setError(result.errorMessage);
    }
    setLoading(false);
  }, [homeId, residentId]);

  useEffect(() => {
    if (!paymentModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setPaymentModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [paymentModalOpen, submitting]);

  async function reverseLedgerRow(transactionId: string) {
    setFormError(null);
    setReversingId(transactionId);
    const res = await fetch(
      `/api/homes/${homeId}/residents/${residentId}/billing-transactions/${encodeURIComponent(transactionId)}/reverse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    setReversingId(null);
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    await refresh();
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const amountMinor = Number.parseInt(amountMinorStr.trim(), 10);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setFormError("Enter amount as a positive whole number of minor units (cents).");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn.trim())) {
      setFormError("Received date must be YYYY-MM-DD.");
      return;
    }

    setSubmitting(true);
    const res = await fetch(
      `/api/homes/${homeId}/residents/${residentId}/billing-payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor,
          receivedOn: receivedOn.trim(),
          method,
          externalReference: externalRef.trim() === "" ? null : externalRef.trim(),
          notes: notes.trim() === "" ? null : notes.trim(),
        }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    setAmountMinorStr("");
    setExternalRef("");
    setNotes("");
    setPaymentModalOpen(false);
    await refresh();
  }

  return (
    <section className="village-panel-card overflow-hidden">
      <header className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_18%,var(--bg-elevated)_82%)] px-5 py-4 sm:px-6">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
          Ledger & payments
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Running balance from posted ledger transactions. A negative balance means
          the resident has a credit (e.g. prepayment) toward future charges.
        </p>
      </header>

      <div className="px-5 py-6 sm:px-6">
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading statement…</p>
        ) : null}
        {!loading && error ? <p className="village-alert-error">{error}</p> : null}

        {!loading && statement ? (
          <>
            <div className="village-card-soft px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Amount owing (positive = balance due)
              </p>
              <p
                className="mt-1 font-display text-2xl font-semibold tabular-nums text-[var(--text-primary)]"
                data-testid="billing-current-balance"
              >
                {formatMinorAsCurrency(statement.currentBalanceMinor, defaultCurrencyCode)}
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--line-subtle)] text-[var(--text-secondary)]">
                    <th className="py-2 pr-3 font-medium">Posted</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Memo</th>
                    <th className="py-2 pr-3 font-medium">Audit</th>
                    <th className="py-2 pr-3 text-right font-medium tabular-nums">Amount</th>
                    <th className="py-2 text-right font-medium tabular-nums">Running balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-6 text-center text-[var(--text-secondary)]"
                      >
                        No ledger transactions yet.
                      </td>
                    </tr>
                  ) : (
                    statement.lines.map(({ transaction: t, runningBalanceMinor: bal }) => (
                      <tr
                        key={t.id}
                        className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_55%,transparent)]"
                      >
                        <td className="py-2 pr-3 whitespace-nowrap text-[var(--text-secondary)]">
                          {new Date(t.postedAtUtcMs).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3">{t.txnType}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-[var(--text-secondary)]">
                          {t.sourceKind}
                          {t.sourceId ? ` · ${t.sourceId.slice(0, 8)}…` : ""}
                        </td>
                        <td className="py-2 pr-3 max-w-[200px] truncate" title={t.memo ?? ""}>
                          {t.memo ?? "—"}
                        </td>
                        <td className="py-2 pr-3 align-top text-xs">
                          {t.reversesTransactionId ? (
                            <span
                              className="text-[var(--text-secondary)]"
                              title={`Full id: ${t.reversesTransactionId}`}
                            >
                              Undoes {shortLedgerId(t.reversesTransactionId)}
                            </span>
                          ) : reversedOriginalIds.has(t.id) ? (
                            <span className="text-[var(--text-secondary)]">Reversed (see pairing row)</span>
                          ) : t.txnType !== "reversal" && t.amountMinor !== 0 ? (
                            <button
                              type="button"
                              className="text-left font-medium text-[var(--accent-primary)] underline decoration-[color:color-mix(in_srgb,var(--accent-primary)_45%,transparent)] underline-offset-2 hover:decoration-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={reversingId !== null}
                              onClick={() => void reverseLedgerRow(t.id)}
                            >
                              {reversingId === t.id ? "Posting…" : "Reverse posting"}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatMinorAsCurrency(t.amountMinor, defaultCurrencyCode)}
                        </td>
                        <td className="py-2 text-right tabular-nums font-medium">
                          {formatMinorAsCurrency(bal, defaultCurrencyCode)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 village-card-soft p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Record payment (ledger)</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Post a resident payment as a ledger transaction.
              </p>
              <button
                type="button"
                className="mt-3 village-btn-primary px-4 py-2 text-sm"
                onClick={() => {
                  setFormError(null);
                  setPaymentModalOpen(true);
                }}
              >
                Record payment
              </button>
            </div>
          </>
        ) : null}
      </div>

      {paymentModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                onClick={() => {
                  if (!submitting) setPaymentModalOpen(false);
                }}
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="text-xl font-semibold tracking-tight text-pine-2">
                            Record payment
                          </h2>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            Add a posted payment transaction to this resident ledger.
                          </p>
                        </div>
                        <button
                          type="button"
                          className={MODAL_CLOSE_BTN_CLASS}
                          onClick={() => setPaymentModalOpen(false)}
                          disabled={submitting}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <form className="grid gap-5 p-5 sm:p-6" onSubmit={(e) => void submitPayment(e)}>
                      {formError ? <p className="village-alert-error text-sm">{formError}</p> : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Amount (minor units)</span>
                          <input
                            className="village-input"
                            type="number"
                            min={1}
                            step={1}
                            value={amountMinorStr}
                            onChange={(e) => setAmountMinorStr(e.target.value)}
                            placeholder="e.g. 150000"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Received on</span>
                          <input
                            className="village-input"
                            type="date"
                            value={receivedOn}
                            onChange={(e) => setReceivedOn(e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">Method</span>
                          <select
                            className="village-input"
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                          >
                            <option value="cash">Cash</option>
                            <option value="transfer">Bank transfer</option>
                            <option value="card">Card</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="village-field-label">External reference</span>
                          <input
                            className="village-input"
                            value={externalRef}
                            onChange={(e) => setExternalRef(e.target.value)}
                            placeholder="Bank reference / receipt #"
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="village-field-label">Notes</span>
                        <textarea
                          className="village-input min-h-[72px]"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </label>
                      <button type="submit" className={MODAL_PRIMARY_BTN_CLASS} disabled={submitting}>
                        {submitting ? "Saving…" : "Post payment"}
                      </button>
                    </form>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
