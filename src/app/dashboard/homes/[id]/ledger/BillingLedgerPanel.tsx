"use client";

import { postedMsWithinRangeInclusive } from "@/lib/billing/postedDateRange";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";

const MODAL_PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent-strong)_78%,transparent)] bg-gradient-to-br from-[color:color-mix(in_srgb,var(--accent)_72%,var(--highlight)_28%)] to-[var(--accent-strong)] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--highlight)_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,var(--accent-strong)_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100 min-h-10";
const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color:color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

const LEDGER_PAGE_SIZE = 50;

export type LedgerPanelPostedDateRange = {
  postedFrom: string;
  postedTo: string;
};

type LedgerAccountKind = "resident" | "home";

type Props = {
  homeId: string;
  ledgerAccountType: LedgerAccountKind;
  residentId: string | null;
  defaultCurrencyCode: string;
  /** When set, only rows whose posted timestamp falls within these UTC days are shown. */
  postedDateRange?: LedgerPanelPostedDateRange | undefined;
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
};

type StatementLine = {
  transaction: LedgerTxn;
  runningBalanceMinor: number;
};

type LedgerTxnTypeFilter = "all" | "charge" | "payment" | "adjustment";

const LEDGER_TXN_TYPE_FILTER_OPTIONS: ReadonlyArray<
  readonly [LedgerTxnTypeFilter, string]
> = [
  ["all", "All"],
  ["charge", "Charges"],
  ["payment", "Payments"],
  ["adjustment", "Adjustments"],
];

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
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
    typeof o.postedAtUtcMs === "number"
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
  ledgerAccountType: LedgerAccountKind,
  residentId: string | null,
): Promise<
  | { ok: true; data: StatementData }
  | { ok: false; errorMessage: string }
> {
  if (ledgerAccountType === "resident" && !residentId) {
    return { ok: false, errorMessage: "Resident account not selected." };
  }
  const url =
    ledgerAccountType === "home"
      ? `/api/homes/${homeId}/home-billing-statement`
      : `/api/homes/${homeId}/residents/${residentId}/billing-statement`;
  const res = await fetch(url);
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

function openingBalanceBeforeIndex(full: StatementLine[], idx: number): number {
  if (idx <= 0) return 0;
  return full[idx - 1].runningBalanceMinor;
}

function txnMatchesTypeFilter(t: LedgerTxn, f: LedgerTxnTypeFilter): boolean {
  if (f === "all") return true;
  return t.txnType === f;
}

function txnMatchesSearch(t: LedgerTxn, q: string): boolean {
  if (q === "") return true;
  const hay = [
    t.txnType,
    t.sourceKind,
    t.sourceId ?? "",
    t.memo ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function BillingLedgerPanel({
  homeId,
  ledgerAccountType,
  residentId,
  defaultCurrencyCode,
  postedDateRange,
}: Props) {
  const [statement, setStatement] = useState<StatementData | null>(null);
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

  const [txnTypeFilter, setTxnTypeFilter] = useState<LedgerTxnTypeFilter>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadBillingStatement(homeId, ledgerAccountType, residentId).then((result) => {
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
  }, [homeId, ledgerAccountType, residentId]);

  useLayoutEffect(() => {
    setPage(1);
  }, [postedDateRange, txnTypeFilter, searchApplied]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchApplied(searchDraft.trim().toLowerCase());
    }, 200);
    return () => window.clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    setTxnTypeFilter("all");
    setSearchDraft("");
    setSearchApplied("");
  }, [homeId, ledgerAccountType, residentId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadBillingStatement(homeId, ledgerAccountType, residentId);
    if (result.ok) {
      setStatement(result.data);
      setError(null);
    } else {
      setStatement(null);
      setError(result.errorMessage);
    }
    setLoading(false);
  }, [homeId, ledgerAccountType, residentId]);

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

  const filteredWithRunning = useMemo(() => {
    if (!statement) return [];

    type Row = StatementLine & { origIdx: number };
    const rows: Row[] = [];
    statement.lines.forEach((line, idx) => {
      const t = line.transaction;
      if (postedDateRange) {
        if (
          !postedMsWithinRangeInclusive(
            t.postedAtUtcMs,
            postedDateRange.postedFrom,
            postedDateRange.postedTo,
          )
        ) {
          return;
        }
      }
      if (!txnMatchesTypeFilter(t, txnTypeFilter)) return;
      if (!txnMatchesSearch(t, searchApplied)) return;
      rows.push({ ...line, origIdx: idx });
    });

    if (rows.length === 0) return [];

    let running = openingBalanceBeforeIndex(statement.lines, rows[0].origIdx);
    return rows.map((r) => {
      running += r.transaction.amountMinor;
      return {
        transaction: r.transaction,
        runningBalanceMinor: running,
      };
    });
  }, [statement, postedDateRange, txnTypeFilter, searchApplied]);

  const totalFiltered = filteredWithRunning.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / LEDGER_PAGE_SIZE));

  useLayoutEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const effectivePage = Math.min(Math.max(1, page), pageCount);
  const pageOffset = (effectivePage - 1) * LEDGER_PAGE_SIZE;
  const pageRows = filteredWithRunning.slice(pageOffset, pageOffset + LEDGER_PAGE_SIZE);
  const fromIdx = totalFiltered === 0 ? 0 : pageOffset + 1;
  const toIdx = Math.min(pageOffset + LEDGER_PAGE_SIZE, totalFiltered);
  const canPrev = effectivePage > 1;
  const canNext = effectivePage < pageCount;

  const netInViewMinor = useMemo(
    () => filteredWithRunning.reduce((s, r) => s + r.transaction.amountMinor, 0),
    [filteredWithRunning],
  );

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
    if (ledgerAccountType === "resident" && !residentId) {
      setFormError("Resident account not selected.");
      return;
    }

    setSubmitting(true);
    const url =
      ledgerAccountType === "home"
        ? `/api/homes/${homeId}/billing-payments`
        : `/api/homes/${homeId}/residents/${residentId}/billing-payments`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountMinor,
        receivedOn: receivedOn.trim(),
        method,
        externalReference: externalRef.trim() === "" ? null : externalRef.trim(),
        notes: notes.trim() === "" ? null : notes.trim(),
      }),
    });
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

  const ledgerFiltersRow = (
    <div
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 lg:flex-nowrap"
      role="group"
      aria-labelledby="ledger-inline-filters-heading"
    >
      <p id="ledger-inline-filters-heading" className="sr-only">
        Ledger filters
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Type
        </span>
        {LEDGER_TXN_TYPE_FILTER_OPTIONS.map(([value, label]) => (
          <label key={value} className="cursor-pointer">
            <input
              type="radio"
              className="peer sr-only"
              name="ledger-txn-type-filter"
              checked={txnTypeFilter === value}
              onChange={() => {
                setTxnTypeFilter(value);
              }}
            />
            <span className="block rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition peer-checked:border-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] peer-checked:bg-[var(--accent-strong)] peer-checked:text-white">
              {label}
            </span>
          </label>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-[14rem] lg:max-w-md">
        <label className="village-field-label" htmlFor="ledger-search-filter">
          Search memo or source
        </label>
        <input
          id="ledger-search-filter"
          type="search"
          className="village-input min-w-0"
          placeholder="e.g. payment, invoice…"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          autoComplete="off"
        />
      </div>
    </div>
  );

  return (
    <>
      <div className="village-reveal village-reveal-delay-2 flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading statement…</p>
        ) : null}
        {!loading && error ? <p className="village-alert-error">{error}</p> : null}

        {!loading && statement ? (
          <>
            <div
              className="flex flex-col divide-y divide-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] shadow-sm sm:flex-row sm:divide-x sm:divide-y-0"
              data-testid="billing-ledger-summary-strip"
            >
              <div className="min-w-0 flex-1 px-4 py-3 sm:px-5 sm:py-4">
                <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                  Amount owing
                </p>
                <p
                  className={
                    statement.currentBalanceMinor > 0
                      ? "mt-1 text-2xl font-semibold leading-tight tracking-tight text-[var(--danger)] sm:text-[1.75rem]"
                      : "mt-1 text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[1.75rem]"
                  }
                  data-testid="billing-current-balance"
                >
                  {formatMinorAsCurrency(statement.currentBalanceMinor, defaultCurrencyCode)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Positive = balance due; negative = credit on account
                </p>
              </div>
              <div className="min-w-0 flex-1 px-4 py-3 sm:px-5 sm:py-4">
                <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                  Entries in view
                </p>
                <p className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[1.75rem]">
                  {totalFiltered}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {statement.lines.length} total on ledger
                </p>
              </div>
              <div className="min-w-0 flex-1 px-4 py-3 sm:px-5 sm:py-4">
                <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                  Net in view
                </p>
                <p
                  className={
                    netInViewMinor > 0
                      ? "mt-1 text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[1.75rem]"
                      : netInViewMinor < 0
                        ? "mt-1 text-2xl font-semibold leading-tight tracking-tight text-[var(--accent-strong)] sm:text-[1.75rem]"
                        : "mt-1 text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[1.75rem]"
                  }
                >
                  {formatMinorAsCurrency(netInViewMinor, defaultCurrencyCode)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Sum of amounts matching filters
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] shadow-[0_20px_58px_-34px_color-mix(in_srgb,var(--accent)_34%,transparent)]">
              <div className="flex flex-col gap-3 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    Ledger & payments
                  </p>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Posted transactions
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-[var(--text-secondary)]">
                    Running balance is recomputed for the rows that match your filters.
                    Account balance above always reflects the full ledger.
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-xl border border-[color:color-mix(in_srgb,var(--accent-strong)_72%,transparent)] bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent)]"
                  onClick={() => {
                    setFormError(null);
                    setPaymentModalOpen(true);
                  }}
                >
                  Record payment
                </button>
              </div>

              <div className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_78%,transparent)] px-5 py-3.5">
                {ledgerFiltersRow}
              </div>

              <div className="overflow-x-auto">
                <table
                  aria-label="Billing ledger"
                  className="min-w-full border-collapse text-left text-sm"
                >
                  <thead>
                    <tr className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)]">
                      <th
                        scope="col"
                        className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                      >
                        Posted
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                      >
                        Type
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                      >
                        Source
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                      >
                        Memo
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                      >
                        Audit
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] tabular-nums"
                      >
                        Amount
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] tabular-nums"
                      >
                        Running balance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:color-mix(in_srgb,var(--line-subtle)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_84%,transparent)]">
                    {statement.lines.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-12 text-center text-[var(--text-secondary)]"
                        >
                          No ledger transactions yet.
                        </td>
                      </tr>
                    ) : totalFiltered === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-12 text-center text-[var(--text-secondary)]"
                        >
                          No rows match these filters.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map(({ transaction: t, runningBalanceMinor: bal }) => (
                        <tr
                          key={t.id}
                          className="transition-colors hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_76%,transparent)]"
                        >
                          <td className="whitespace-nowrap px-5 py-4 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                            {new Date(t.postedAtUtcMs).toLocaleString()}
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                              {t.txnType}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-[var(--text-secondary)]">
                            {t.sourceKind}
                            {t.sourceId ? ` · ${t.sourceId.slice(0, 8)}…` : ""}
                          </td>
                          <td
                            className="max-w-[220px] truncate px-5 py-4 text-[var(--text-primary)]"
                            title={t.memo ?? ""}
                          >
                            {t.memo ?? "—"}
                          </td>
                          <td className="px-5 py-4 align-top text-xs text-[var(--text-muted)]">
                            {t.recordedByUserId ? `${t.recordedByUserId.slice(0, 8)}…` : "—"}
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                            {formatMinorAsCurrency(t.amountMinor, defaultCurrencyCode)}
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums font-medium text-[var(--text-primary)]">
                            {formatMinorAsCurrency(bal, defaultCurrencyCode)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[var(--text-secondary)]">
                  {totalFiltered === 0
                    ? "Showing 0 of 0"
                    : `Showing ${fromIdx}–${toIdx} of ${totalFiltered}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-[color:color-mix(in_srgb,var(--line-strong)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_76%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canPrev}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[color:color-mix(in_srgb,var(--line-strong)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_76%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canNext}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
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
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl"
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
                            {ledgerAccountType === "home"
                              ? "Add a posted payment to the facility operating account."
                              : "Add a posted payment transaction to this resident ledger."}
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
    </>
  );
}
