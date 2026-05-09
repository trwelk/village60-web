"use client";

import { VillageSelect } from "@/components/VillageSelect";
import type { ResidentBillingAccountSummary } from "@/lib/billing/paymentsLifecycle";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { InvoicesListClient } from "./InvoicesListClient";

type HomeOption = { homeId: string; homeName: string; defaultCurrencyCode: string };

export type InvoicesBillingAccountTypeFilter = "resident" | "home";

type Props = {
  homes: HomeOption[];
  selectedHomeId: string;
  selectedAccountType: InvoicesBillingAccountTypeFilter;
  selectedResidentId: string;
  accounts: ResidentBillingAccountSummary[];
};

export function InvoicesDashboardClient({
  homes,
  selectedHomeId,
  selectedAccountType,
  selectedResidentId,
  accounts,
}: Props) {
  const router = useRouter();
  const [accountTypeDraft, setAccountTypeDraft] = useState(selectedAccountType);
  const [homeDraft, setHomeDraft] = useState(selectedHomeId);
  const [residentDraft, setResidentDraft] = useState(selectedResidentId);
  const [isApplyingFilters, startApplyingFilters] = useTransition();

  const activeHome = useMemo(
    () => homes.find((h) => h.homeId === selectedHomeId) ?? null,
    [homes, selectedHomeId],
  );

  useEffect(() => {
    setAccountTypeDraft(selectedAccountType);
    setHomeDraft(selectedHomeId);
    setResidentDraft(selectedResidentId);
  }, [selectedAccountType, selectedHomeId, selectedResidentId]);

  if (homes.length === 0) {
    return <div className="village-card p-8">You do not have access to any homes.</div>;
  }

  const currency = activeHome?.defaultCurrencyCode ?? "NZD";
  const residentOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.residentId,
        label: account.fullName,
      })),
    [accounts],
  );

  const hasFilterChanges =
    accountTypeDraft !== selectedAccountType ||
    homeDraft !== selectedHomeId ||
    (accountTypeDraft === "resident" && residentDraft !== selectedResidentId);

  const isApplyDisabled = !homeDraft || !hasFilterChanges || isApplyingFilters;

  const accountTypeOptions = useMemo(
    () => [
      { value: "resident" as const, label: "Resident" },
      { value: "home" as const, label: "Home" },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="village-card village-reveal village-reveal-delay-1 relative z-20 rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-5 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-6">
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
              options={accountTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            <span className="village-label">Home</span>
            <VillageSelect
              value={homeDraft}
              onChange={(nextId) => {
                setHomeDraft(nextId);
                setResidentDraft("");
              }}
              options={homes.map((h) => ({ value: h.homeId, label: h.homeName }))}
            />
          </label>
          {accountTypeDraft === "resident" ? (
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              <span className="village-label">Resident (optional)</span>
              <VillageSelect
                value={residentDraft}
                onChange={setResidentDraft}
                options={[{ value: "", label: "All residents" }, ...residentOptions]}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="h-10 w-full rounded-xl border border-[color:color-mix(in_srgb,var(--accent-strong)_72%,transparent)] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] disabled:bg-[color:color-mix(in_srgb,var(--bg-muted)_84%,transparent)] disabled:text-[var(--text-muted)] lg:w-auto"
            disabled={isApplyDisabled}
            aria-busy={isApplyingFilters}
            onClick={() => {
              if (isApplyDisabled) return;
              startApplyingFilters(() => {
                const params = new URLSearchParams({
                  homeId: homeDraft,
                  accountType: accountTypeDraft,
                });
                if (accountTypeDraft === "resident" && residentDraft) {
                  params.set("residentId", residentDraft);
                }
                router.push(`/dashboard/invoices?${params.toString()}`);
              });
            }}
          >
            {isApplyingFilters ? "Applying..." : "Apply filters"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-4 text-sm text-[var(--text-secondary)]">
          <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-3 py-1.5 font-medium text-[var(--text-primary)]">
            {selectedAccountType === "home" ? "Home" : "Resident"} ·{" "}
            {activeHome?.homeName ?? "—"}
          </span>
          {selectedAccountType === "resident" ? (
            selectedResidentId ? (
              <span className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                Filtered to one resident
              </span>
            ) : (
              <span>Showing all residents in this home.</span>
            )
          ) : (
            <span>Shows operating (home) invoices for the selected facility.</span>
          )}
        </div>
      </section>

      {activeHome ? (
        <InvoicesListClient
          homeId={selectedHomeId}
          homeName={activeHome.homeName}
          homes={homes.map((h) => ({ homeId: h.homeId, homeName: h.homeName }))}
          defaultCurrencyCode={currency}
          accountTypeFilter={selectedAccountType}
          selectedResidentId={selectedResidentId}
          accounts={accounts}
        />
      ) : null}
    </div>
  );
}
