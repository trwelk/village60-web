"use client";

/* eslint-disable react-hooks/set-state-in-effect -- intentional sync Effects */

import { VillageList } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  buildDashboardLedgerPath,
  type DashboardLedgerAccountType,
} from "@/lib/billing/dashboardLedgerPath";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { BillingLedgerPanel } from "../homes/[id]/ledger/BillingLedgerPanel";

type HomeOption = {
  homeId: string;
  homeName: string;
  defaultCurrencyCode: string;
};

type ResidentOption = {
  residentId: string;
  residentFullName: string;
  residentStatus: string;
};

export type LedgerDashboardAccountTypeFilter =
  DashboardLedgerAccountType;

type Props = {
  homes: HomeOption[];
  selectedHomeId: string;
  selectedAccountType: LedgerDashboardAccountTypeFilter;
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
  selectedAccountType,
  selectedResidentId,
  residentOptions,
  postedFrom,
  postedTo,
  ytdPostedFrom,
  ytdPostedTo,
}: Props) {
  const router = useRouter();
  const [accountTypeDraft, setAccountTypeDraft] =
    useState<DashboardLedgerAccountType>(selectedAccountType);
  const [homeDraft, setHomeDraft] = useState(selectedHomeId);
  const [residentDraft, setResidentDraft] = useState(
    selectedResidentId ?? "",
  );
  const [fromDraft, setFromDraft] = useState(postedFrom);
  const [toDraft, setToDraft] = useState(postedTo);
  const [isApplyingFilters, startApplyingFilters] = useTransition();
  const [isApplyingRange, startApplyingRange] = useTransition();

  const activeHome = useMemo(
    () => homes.find((home) => home.homeId === selectedHomeId) ?? null,
    [homes, selectedHomeId],
  );

  const accountTypeOptions = useMemo(
    () =>
      [
        { value: "resident" as const, label: "Resident" },
        { value: "home" as const, label: "Home" },
      ] as const,
    [],
  );

  useEffect(() => {
    setAccountTypeDraft(selectedAccountType);
    setHomeDraft(selectedHomeId);
    setResidentDraft(selectedResidentId ?? "");
  }, [selectedAccountType, selectedHomeId, selectedResidentId]);

  useEffect(() => {
    setFromDraft(postedFrom);
    setToDraft(postedTo);
  }, [postedFrom, postedTo]);

  if (homes.length === 0) {
    return (
      <div className="village-card p-8">You do not have access to any homes.</div>
    );
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

  const hasScopeFilterChanges =
    accountTypeDraft !== selectedAccountType ||
    homeDraft !== selectedHomeId ||
    (accountTypeDraft === "resident" &&
      residentDraft !== (selectedResidentId ?? ""));
  const isApplyScopeDisabled =
    !homeDraft || !hasScopeFilterChanges || isApplyingFilters;

  const selectedHomeName =
    homes.find((home) => home.homeId === selectedHomeId)?.homeName ??
    "Selected home";

  const ledgerActiveFilterCount =
    (selectedResidentId ? 1 : 0) +
    (postedFrom !== ytdPostedFrom || postedTo !== ytdPostedTo ? 1 : 0);

  return (
    <div className="flex flex-col gap-7">
      <VillageList
        rootElement="div"
        wrapBody="none"
        listTitle={null}
        filtersCollapsible
        activeFilterCount={ledgerActiveFilterCount}
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1" aria-hidden />
            <button
              type="button"
              className="village-btn-secondary shrink-0"
              onClick={() => router.refresh()}
            >
              Refresh
            </button>
          </div>
        }
        filters={
          <div
            className="flex w-full min-w-0 flex-[1_1_100%] flex-col gap-4"
            data-testid="dashboard-ledger-filters"
          >
        <div
          className={
            accountTypeDraft === "resident"
              ? "grid gap-4 lg:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1fr)_minmax(14rem,1fr)_auto] lg:items-end"
              : "grid gap-4 lg:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1fr)_auto] lg:items-end"
          }
        >
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            <span className="village-label">Account type</span>
            <VillageSelect
              value={accountTypeDraft}
              onChange={(v) => {
                const next = v === "home" ? "home" : "resident";
                setAccountTypeDraft(next);
                if (next === "home") {
                  setResidentDraft("");
                }
              }}
              options={accountTypeOptions.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            <span className="village-label">Home</span>
            <VillageSelect
              id="ledger-dash-home"
              value={homeDraft}
              onChange={(id) => {
                setHomeDraft(id);
                setResidentDraft("");
              }}
              options={homes.map((h) => ({
                value: h.homeId,
                label: h.homeName,
              }))}
            />
          </label>
          {accountTypeDraft === "resident" ? (
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              <span className="village-label">Resident</span>
              <VillageSelect
                id="ledger-dash-resident"
                value={residentDraft}
                onChange={setResidentDraft}
                options={[
                  { value: "", label: "All residents" },
                  ...residentOptions.map((r) => ({
                    value: r.residentId,
                    label:
                      r.residentStatus === "active"
                        ? r.residentFullName
                        : `${r.residentFullName} (Departed)`,
                  })),
                ]}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="h-10 w-full rounded-xl border border-[color:color-mix(in_srgb,var(--accent-strong)_72%,transparent)] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] disabled:bg-[color:color-mix(in_srgb,var(--bg-muted)_84%,transparent)] disabled:text-[var(--text-muted)] lg:w-auto"
            disabled={isApplyScopeDisabled}
            aria-busy={isApplyingFilters}
            onClick={() => {
              if (isApplyScopeDisabled || !homeDraft) return;
              const nextAccountType =
                accountTypeDraft === "home" ? "home" : "resident";
              const nextResidentId =
                nextAccountType === "resident"
                  ? residentDraft === ""
                    ? null
                    : residentDraft
                  : null;
              startApplyingFilters(() => {
                router.push(
                  buildDashboardLedgerPath(
                    homeDraft,
                    postedFrom,
                    postedTo,
                    ytdPostedFrom,
                    ytdPostedTo,
                    {
                      accountType: nextAccountType,
                      residentId: nextResidentId,
                    },
                  ),
                );
              });
            }}
          >
            {isApplyingFilters ? "Applying…" : "Apply filters"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-4 text-sm text-[var(--text-secondary)]">
          <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-3 py-1.5 font-medium text-[var(--text-primary)]">
            {selectedAccountType === "home" ? "Home" : "Resident"} ·{" "}
            {selectedHomeName}
          </span>
          {selectedAccountType === "resident" ? (
            selectedResidentId ? (
              <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                Filtered to one resident
              </span>
            ) : (
              <span>Select a resident below to open their statement.</span>
            )
          ) : (
            <span>Shows the facility operating (home) account ledger.</span>
          )}
        </div>

        <div className="border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(18rem,1.2fr)_auto] lg:items-end">
            <fieldset className="min-w-0">
              <legend className="village-label">Posted date range (UTC)</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label
                    className="village-field-label"
                    htmlFor="ledger-posted-from"
                  >
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
                  <label
                    className="village-field-label"
                    htmlFor="ledger-posted-to"
                  >
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
                      {
                        accountType: selectedAccountType,
                        residentId: selectedResidentId,
                      },
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
          <p className="text-sm text-[var(--danger)]" role="alert">
            From date must be earlier than or equal to To date.
          </p>
        ) : hasRangeDraftChanges && (!fromOk || !toOk) ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            Use complete dates (YYYY-MM-DD) for both fields.
          </p>
        ) : null}
          </div>
        }
      >
      {activeHome && selectedAccountType === "home" ? (
        <BillingLedgerPanel
          homeId={activeHome.homeId}
          ledgerAccountType="home"
          residentId={null}
          defaultCurrencyCode={activeHome.defaultCurrencyCode}
          postedDateRange={{ postedFrom, postedTo }}
        />
      ) : activeHome && selectedResidentId ? (
        <BillingLedgerPanel
          homeId={activeHome.homeId}
          ledgerAccountType="resident"
          residentId={selectedResidentId}
          defaultCurrencyCode={activeHome.defaultCurrencyCode}
          postedDateRange={{ postedFrom, postedTo }}
        />
      ) : activeHome && selectedAccountType === "resident" && residentOptions.length > 0 ? (
        <div className="flex flex-col gap-6" data-testid="dashboard-ledger-all-residents">
          {residentOptions.map((r) => (
            <div key={r.residentId}>
              <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
                {r.residentFullName}
                {r.residentStatus !== "active" ? (
                  <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                    (Departed)
                  </span>
                ) : null}
              </p>
              <BillingLedgerPanel
                homeId={activeHome.homeId}
                ledgerAccountType="resident"
                residentId={r.residentId}
                defaultCurrencyCode={activeHome.defaultCurrencyCode}
                postedDateRange={{ postedFrom, postedTo }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div
          className="village-panel-card px-5 py-10 text-center text-sm text-[var(--text-secondary)] sm:px-8"
          data-testid="dashboard-ledger-empty-prompt"
        >
          {selectedAccountType === "resident"
            ? "Select a resident to view their statement and post payments."
            : null}
        </div>
      )}
      </VillageList>
    </div>
  );
}
