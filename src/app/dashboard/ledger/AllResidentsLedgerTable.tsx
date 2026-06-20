"use client";

/* eslint-disable react-hooks/set-state-in-effect -- intentional sync Effects */

import { postedMsWithinRangeInclusive } from "@/lib/billing/postedDateRange";
import type { LedgerPanelPostedDateRange } from "../homes/[id]/ledger/BillingLedgerPanel";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

const LEDGER_PAGE_SIZE = 50;

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

type ApiLineRow = {
  residentId: string;
  residentFullName: string;
  residentStatus: "active" | "departed";
  accountId: string;
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

function txnTypeBadgeClass(txnType: string): string {
  if (txnType === "charge")
    return "rounded-xl border border-[color:color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--bg-elevated)_88%)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[color:color-mix(in_srgb,var(--warning)_95%,var(--text-primary)_5%)]";
  if (txnType === "payment")
    return "rounded-xl border border-[color:color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--success)_12%,var(--bg-elevated)_88%)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[color:color-mix(in_srgb,var(--success)_90%,var(--text-primary)_10%)]";
  if (txnType === "adjustment")
    return "rounded-xl border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--bg-elevated)_90%)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent-strong)]";
  return "rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]";
}

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

function parseAllResidentsPayload(data: unknown): ApiLineRow[] | null {
  if (typeof data !== "object" || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (!Array.isArray(rec.lines)) return null;
  const out: ApiLineRow[] = [];
  for (const row of rec.lines) {
    if (typeof row !== "object" || row === null) return null;
    const line = row as Record<string, unknown>;
    if (
      typeof line.residentId !== "string" ||
      typeof line.residentFullName !== "string" ||
      (line.residentStatus !== "active" && line.residentStatus !== "departed") ||
      typeof line.accountId !== "string" ||
      typeof line.runningBalanceMinor !== "number" ||
      !isLedgerTxn(line.transaction)
    ) {
      return null;
    }
    out.push({
      residentId: line.residentId,
      residentFullName: line.residentFullName,
      residentStatus: line.residentStatus,
      accountId: line.accountId,
      transaction: line.transaction,
      runningBalanceMinor: line.runningBalanceMinor,
    });
  }
  return out;
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

function openingBalanceBeforeIndex(full: ApiLineRow[], idx: number): number {
  const accountId = full[idx].accountId;
  let sum = 0;
  for (let j = 0; j < idx; j++) {
    if (full[j].accountId === accountId) {
      sum += full[j].transaction.amountMinor;
    }
  }
  return sum;
}

type ResidentOption = {
  residentId: string;
  residentFullName: string;
  residentStatus: string;
};

type Props = {
  homeId: string;
  defaultCurrencyCode: string;
  postedDateRange: LedgerPanelPostedDateRange;
  residentOptions: ResidentOption[];
};

export function AllResidentsLedgerTable({
  homeId,
  defaultCurrencyCode,
  postedDateRange,
  residentOptions: _residentOptions,
}: Props) {
  const [allLines, setAllLines] = useState<ApiLineRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [txnTypeFilter, setTxnTypeFilter] = useState<LedgerTxnTypeFilter>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/homes/${homeId}/all-residents-billing-statement`);
    if (!res.ok) {
      setAllLines(null);
      setError(await parseError(res));
      setLoading(false);
      return;
    }
    const data: unknown = await res.json();
    const parsed = parseAllResidentsPayload(data);
    if (!parsed) {
      setAllLines(null);
      setError("Unexpected ledger response.");
      setLoading(false);
      return;
    }
    setAllLines(parsed);
    setLoading(false);
  }, [homeId]);

  useEffect(() => {
    setAllLines(null);
  }, [homeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    setPage(1);
  }, [postedDateRange, txnTypeFilter, searchApplied, homeId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchApplied(searchDraft.trim().toLowerCase());
    }, 200);
    return () => window.clearTimeout(t);
  }, [searchDraft]);

  const aggregateAmountOwingMinor = useMemo(() => {
    if (!allLines || allLines.length === 0) return 0;
    const finals = new Map<string, number>();
    for (const row of allLines) {
      finals.set(row.accountId, row.runningBalanceMinor);
    }
    let sum = 0;
    for (const v of finals.values()) sum += v;
    return sum;
  }, [allLines]);

  const filteredWithRunning = useMemo(() => {
    if (!allLines || allLines.length === 0) return [];
    const rows: Array<ApiLineRow & { origIdx: number }> = [];
    allLines.forEach((line, idx) => {
      const t = line.transaction;
      if (
        !postedMsWithinRangeInclusive(
          t.postedAtUtcMs,
          postedDateRange.postedFrom,
          postedDateRange.postedTo,
        )
      ) {
        return;
      }
      if (!txnMatchesTypeFilter(t, txnTypeFilter)) return;
      if (!txnMatchesSearch(t, searchApplied)) return;
      rows.push({ ...line, origIdx: idx });
    });
    return rows.map((r) => {
      const opening = openingBalanceBeforeIndex(allLines, r.origIdx);
      const displayedRunning = opening + r.transaction.amountMinor;
      return {
        ...r,
        runningBalanceMinor: displayedRunning,
      };
    });
  }, [allLines, postedDateRange, txnTypeFilter, searchApplied]);

  const totalTxnOnLedgers = allLines?.length ?? 0;

  const netInViewMinor = useMemo(
    () =>
      filteredWithRunning.reduce((s, r) => s + r.transaction.amountMinor, 0),
    [filteredWithRunning],
  );

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

  const ledgerFiltersRow = (
    <div
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 lg:flex-nowrap"
      role="group"
      aria-labelledby="all-ledger-inline-filters-heading"
    >
      <p id="all-ledger-inline-filters-heading" className="sr-only">
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
              name="all-ledger-txn-type-filter"
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
        <label className="village-field-label" htmlFor="all-ledger-search-filter">
          Search memo or source
        </label>
        <input
          id="all-ledger-search-filter"
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
      <div
        className="village-reveal village-reveal-delay-2 flex flex-col gap-4"
        data-testid="dashboard-ledger-all-residents"
      >
        {error && !loading ? <p className="village-alert-error">{error}</p> : null}

        {allLines ? (
          <div
            className={
              loading
                ? "opacity-50 transition-opacity duration-150 [pointer-events:none] motion-reduce:transition-none"
                : undefined
            }
          >
          <>
            <div
              className="flex flex-col divide-y divide-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] shadow-sm sm:flex-row sm:divide-x sm:divide-y-0"
              data-testid="all-residents-ledger-summary-strip"
            >
              <div className="min-w-0 flex-1 px-4 py-3 sm:px-5 sm:py-4">
                <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--text-muted)_88%,transparent)]">
                  Amount owing (all accounts)
                </p>
                <p
                  className={
                    aggregateAmountOwingMinor > 0
                      ? "mt-1 text-2xl font-semibold leading-tight tracking-tight text-[var(--danger)] sm:text-[1.75rem]"
                      : "mt-1 text-2xl font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[1.75rem]"
                  }
                >
                  {formatMinorAsCurrency(aggregateAmountOwingMinor, defaultCurrencyCode)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Sum of current balances; positive = net due across residents
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
                  {totalTxnOnLedgers} total posted rows in this home
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
              <div className="flex flex-col gap-3 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] px-5 py-4">
                <div className="min-w-0">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    Ledger & payments
                  </p>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Posted transactions
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-[var(--text-secondary)]">
                    One table for every resident account. Running balance is per
                    account owner for rows that match your filters. Record payments
                    from invoice detail or monthly collection.
                  </p>
                </div>
              </div>

              <div className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_78%,transparent)] px-5 py-3.5">
                {ledgerFiltersRow}
              </div>

              <div className="overflow-x-auto">
                <table
                  aria-label="All residents billing ledger"
                  className="min-w-full border-collapse text-left text-sm"
                >
                  <thead>
                    <tr className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)]">
                      <th
                        scope="col"
                        className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                      >
                        Account owner
                      </th>
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
                    {totalTxnOnLedgers === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-5 py-12 text-center text-[var(--text-secondary)]"
                        >
                          No ledger transactions yet for residents at this home.
                        </td>
                      </tr>
                    ) : totalFiltered === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-5 py-12 text-center text-[var(--text-secondary)]"
                        >
                          No rows match these filters.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row) => {
                        const t = row.transaction;
                        const bal = row.runningBalanceMinor;
                        return (
                          <tr
                            key={t.id}
                            className="transition-colors hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_76%,transparent)]"
                          >
                            <td className="whitespace-normal px-5 py-4 text-[var(--text-primary)]">
                              <span className="font-medium">
                                {row.residentFullName}
                              </span>
                              {row.residentStatus !== "active" ? (
                                <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                                  (Departed)
                                </span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                              {new Date(t.postedAtUtcMs).toLocaleString()}
                            </td>
                            <td className="px-5 py-4">
                              <span className={txnTypeBadgeClass(t.txnType)}>
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
                              {t.recordedByUserId
                                ? `${t.recordedByUserId.slice(0, 8)}…`
                                : "—"}
                            </td>
                            <td
                              className={
                                t.amountMinor > 0
                                  ? "px-5 py-4 text-right tabular-nums font-semibold text-[var(--danger)]"
                                  : t.amountMinor < 0
                                    ? "px-5 py-4 text-right tabular-nums font-semibold text-[var(--success)]"
                                    : "px-5 py-4 text-right tabular-nums font-semibold text-[var(--text-primary)]"
                              }
                            >
                              {formatMinorAsCurrency(t.amountMinor, defaultCurrencyCode)}
                            </td>
                            <td
                              className={
                                bal > 0
                                  ? "px-5 py-4 text-right tabular-nums font-medium text-[var(--danger)]"
                                  : bal < 0
                                    ? "px-5 py-4 text-right tabular-nums font-medium text-[var(--success)]"
                                    : "px-5 py-4 text-right tabular-nums font-medium text-[var(--text-primary)]"
                              }
                            >
                              {formatMinorAsCurrency(bal, defaultCurrencyCode)}
                            </td>
                          </tr>
                        );
                      })
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
          </div>
        ) : null}
        {!allLines && loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading ledgers…</p>
        ) : null}
      </div>
    </>
  );
}
