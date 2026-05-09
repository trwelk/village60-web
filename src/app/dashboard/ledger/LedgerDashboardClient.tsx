"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { buildDashboardLedgerPath } from "@/lib/billing/dashboardLedgerPath";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BillingLedgerPanel } from "../homes/[id]/ledger/BillingLedgerPanel";

type HomeOption = { homeId: string; homeName: string; defaultCurrencyCode: string };

type ResidentOption = {
  residentId: string;
  residentFullName: string;
  residentStatus: string;
};

type Props = {
  homes: HomeOption[];
  selectedHomeId: string;
  selectedResidentId: string | null;
  residentOptions: ResidentOption[];
  postedFrom: string;
  postedTo: string;
  ytdPostedFrom: string;
  ytdPostedTo: string;
};

export function LedgerDashboardClient({
  homes,
  selectedHomeId,
  selectedResidentId,
  residentOptions,
  postedFrom,
  postedTo,
  ytdPostedFrom,
  ytdPostedTo,
}: Props) {
  const router = useRouter();
  const [fromDraft, setFromDraft] = useState(postedFrom);
  const [toDraft, setToDraft] = useState(postedTo);
  const [isApplyingRange, startApplyingRange] = useTransition();

  const activeHome = useMemo(
    () => homes.find((home) => home.homeId === selectedHomeId) ?? null,
    [homes, selectedHomeId],
  );

  useEffect(() => {
    setFromDraft(postedFrom);
    setToDraft(postedTo);
  }, [postedFrom, postedTo]);

  if (homes.length === 0) {
    return <div className="village-card p-8">You do not have access to any homes.</div>;
  }

  const normalizedFromDraft = fromDraft.trim() || ytdPostedFrom;
  const normalizedToDraft = toDraft.trim() || ytdPostedTo;
  const fromOk = /^\d{4}-\d{2}-\d{2}$/.test(normalizedFromDraft);
  const toOk = /^\d{4}-\d{2}-\d{2}$/.test(normalizedToDraft);
  const hasRangeDraftChanges =
    normalizedFromDraft !== postedFrom || normalizedToDraft !== postedTo;
  const hasInvalidOrder =
    fromOk && toOk && normalizedFromDraft > normalizedToDraft;
  const isApplyRangeDisabled =
    !selectedHomeId ||
    !hasRangeDraftChanges ||
    !fromOk ||
    !toOk ||
    hasInvalidOrder ||
    isApplyingRange;

  return (
    <div className="flex flex-col gap-7">
      <header className="village-reveal">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[1.65rem]">
          Resident ledger
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
          Billing statements and posted transactions by resident. Choose a home and resident,
          then narrow by posted date range.
        </p>
      </header>

      <section
        data-testid="dashboard-ledger-filters"
        className="village-card village-reveal village-reveal-delay-1 relative z-20 rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-5 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,16rem)_minmax(16rem,1fr)] lg:items-end">
          <div className="flex flex-col gap-2">
            <label htmlFor="ledger-dash-home" className="village-label">
              Home
            </label>
            <VillageSelect
              id="ledger-dash-home"
              value={selectedHomeId}
              onChange={(id) => {
                router.push(
                  buildDashboardLedgerPath(
                    id,
                    postedFrom,
                    postedTo,
                    ytdPostedFrom,
                    ytdPostedTo,
                    { residentId: null },
                  ),
                );
              }}
              options={homes.map((h) => ({
                value: h.homeId,
                label: h.homeName,
              }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ledger-dash-resident" className="village-label">
              Resident (optional)
            </label>
            <VillageSelect
              id="ledger-dash-resident"
              value={selectedResidentId ?? ""}
              onChange={(id) => {
                const next = id === "" ? null : id;
                if (!selectedHomeId) return;
                router.push(
                  buildDashboardLedgerPath(
                    selectedHomeId,
                    postedFrom,
                    postedTo,
                    ytdPostedFrom,
                    ytdPostedTo,
                    { residentId: next },
                  ),
                );
              }}
              options={[
                { value: "", label: "Select a resident" },
                ...residentOptions.map((r) => ({
                  value: r.residentId,
                  label:
                    r.residentStatus === "active"
                      ? r.residentFullName
                      : `${r.residentFullName} (Departed)`,
                })),
              ]}
            />
          </div>
        </div>

        <div className="mt-5 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(18rem,1.2fr)_auto] lg:items-end">
            <fieldset className="min-w-0">
              <legend className="village-label">Posted date range (UTC)</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label className="village-field-label" htmlFor="ledger-posted-from">
                    From
                  </label>
                  <input
                    className="village-input min-w-0"
                    id="ledger-posted-from"
                    type="date"
                    value={fromDraft}
                    onChange={(e) => setFromDraft(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label className="village-field-label" htmlFor="ledger-posted-to">
                    To
                  </label>
                  <input
                    className="village-input min-w-0"
                    id="ledger-posted-to"
                    type="date"
                    value={toDraft}
                    onChange={(e) => setToDraft(e.target.value)}
                  />
                </div>
              </div>
            </fieldset>
            <button
              className="h-10 w-full shrink-0 rounded-xl border border-[color:color-mix(in_srgb,var(--accent-strong)_72%,transparent)] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] disabled:bg-[color:color-mix(in_srgb,var(--bg-muted)_84%,transparent)] disabled:text-[var(--text-muted)] lg:w-auto lg:self-end"
              type="button"
              disabled={isApplyRangeDisabled}
              aria-busy={isApplyingRange}
              onClick={() => {
                if (isApplyRangeDisabled || !selectedHomeId) return;
                startApplyingRange(() => {
                  router.push(
                    buildDashboardLedgerPath(
                      selectedHomeId,
                      normalizedFromDraft,
                      normalizedToDraft,
                      ytdPostedFrom,
                      ytdPostedTo,
                      { residentId: selectedResidentId },
                    ),
                  );
                });
              }}
            >
              {isApplyingRange ? "Applying…" : "Apply range"}
            </button>
          </div>
        </div>
        {hasInvalidOrder ? (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            From date must be earlier than or equal to To date.
          </p>
        ) : hasRangeDraftChanges && (!fromOk || !toOk) ? (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            Use complete dates (YYYY-MM-DD) for both fields.
          </p>
        ) : null}
      </section>

      {activeHome && selectedResidentId ? (
        <BillingLedgerPanel
          homeId={activeHome.homeId}
          residentId={selectedResidentId}
          defaultCurrencyCode={activeHome.defaultCurrencyCode}
          postedDateRange={{ postedFrom, postedTo }}
        />
      ) : (
        <div
          className="village-panel-card px-5 py-10 text-center text-sm text-[var(--text-secondary)] sm:px-8"
          data-testid="dashboard-ledger-empty-prompt"
        >
          Select a resident to view their statement and post payments.
        </div>
      )}
    </div>
  );
}
