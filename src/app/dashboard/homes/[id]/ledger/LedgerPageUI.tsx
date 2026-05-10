"use client";

import { ResidentCombobox } from "@/components/ResidentCombobox";
import type { ResidentBillingAccountSummary } from "@/lib/billing/paymentsLifecycle";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { BillingLedgerPanel } from "./BillingLedgerPanel";

type Props = {
  homeId: string;
  homeName: string;
  defaultCurrencyCode: string;
  accounts: ResidentBillingAccountSummary[];
};

export function LedgerPageUI({
  homeId,
  homeName,
  defaultCurrencyCode,
  accounts,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const residentIdParam = searchParams.get("residentId");

  const knownIds = useMemo(
    () => new Set(accounts.map((a) => a.residentId)),
    [accounts],
  );

  const selectedResidentId =
    residentIdParam && knownIds.has(residentIdParam) ? residentIdParam : null;

  const setResidentId = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set("residentId", next);
      } else {
        params.delete("residentId");
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : `/dashboard/homes/${homeId}/ledger`);
    },
    [homeId, router, searchParams],
  );

  const comboboxOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.residentId,
        label: a.fullName,
        hint: a.status === "departed" ? "Departed" : undefined,
      })),
    [accounts],
  );

  return (
    <main className="flex flex-col gap-8 text-ink">
      <div className="village-reveal flex flex-wrap items-center gap-2 text-sm text-ink/75">
        <Link
          href={`/dashboard/homes/${homeId}/residents`}
          className="font-semibold text-pine underline decoration-terracotta/35 underline-offset-[5px] transition hover:text-terracotta hover:decoration-terracotta/60"
        >
          Residents at this home
        </Link>
        <span className="text-ink/30" aria-hidden>
          /
        </span>
        <span className="font-medium text-ink/85">{homeName}</span>
      </div>

      <section className="village-card village-reveal village-reveal-delay-1 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <p className="village-kicker">Billing</p>
          <h1 className="font-display text-3xl font-normal tracking-tight text-pine-2">
            Ledger
          </h1>
          <p className="text-sm text-ink/70">
            Review the running balance and payments for residents at {homeName}.
            Pick a resident to load their ledger.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:max-w-md">
          <label
            className="village-field-label"
            htmlFor="ledger-resident-filter"
          >
            Resident
          </label>
          <ResidentCombobox
            id="ledger-resident-filter"
            value={selectedResidentId}
            onChange={setResidentId}
            options={comboboxOptions}
            placeholder="Search residents…"
            ariaLabel="Filter ledger by resident"
          />
        </div>
      </section>

      <div className="village-reveal village-reveal-delay-2">
        {selectedResidentId ? (
          <BillingLedgerPanel
            homeId={homeId}
            ledgerAccountType="resident"
            residentId={selectedResidentId}
            defaultCurrencyCode={defaultCurrencyCode}
          />
        ) : (
          <div
            className="village-panel-card px-5 py-10 text-center text-sm text-[var(--text-secondary)] sm:px-8"
            data-testid="ledger-empty-prompt"
          >
            Select a resident above to view their ledger and payments.
          </div>
        )}
      </div>
    </main>
  );
}
