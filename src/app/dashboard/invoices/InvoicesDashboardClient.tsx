"use client";

import { VillageSelect } from "@/components/VillageSelect";
import type { ResidentBillingAccountSummary } from "@/lib/billing/paymentsLifecycle";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { InvoicesListClient } from "./InvoicesListClient";

type HomeOption = { homeId: string; homeName: string; defaultCurrencyCode: string };

type Props = {
  homes: HomeOption[];
  selectedHomeId: string;
  accounts: ResidentBillingAccountSummary[];
};

export function InvoicesDashboardClient({
  homes,
  selectedHomeId,
  accounts,
}: Props) {
  const router = useRouter();

  const activeHome = useMemo(
    () => homes.find((h) => h.homeId === selectedHomeId) ?? null,
    [homes, selectedHomeId],
  );

  if (homes.length === 0) {
    return <div className="village-card p-8">You do not have access to any homes.</div>;
  }

  const homeLabel = activeHome?.homeName ?? "Unknown home";
  const currency = activeHome?.defaultCurrencyCode ?? "NZD";

  return (
    <div className="flex flex-col gap-6">
      <section className="village-card relative overflow-hidden p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[minmax(15rem,22rem),1fr]">
          <label className="flex flex-col gap-2 text-sm">
            <span className="village-field-label">Home</span>
            <VillageSelect
              value={selectedHomeId}
              onChange={(nextId) =>
                router.push(`/dashboard/invoices?homeId=${encodeURIComponent(nextId)}`)
              }
              options={homes.map((h) => ({ value: h.homeId, label: h.homeName }))}
            />
          </label>
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[linear-gradient(130deg,color-mix(in_srgb,var(--bg-muted)_86%,var(--bg-elevated)_14%),color-mix(in_srgb,var(--highlight)_12%,var(--bg-muted)_88%))] p-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Selected home
            </p>
            <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{homeLabel}</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Review drafts and finalized invoices here, then open one to manage lines and post charges.
            </p>
          </div>
        </div>
      </section>

      {activeHome ? (
        <InvoicesListClient
          homeId={selectedHomeId}
          homeName={homeLabel}
          defaultCurrencyCode={currency}
          accounts={accounts}
        />
      ) : null}
    </div>
  );
}
