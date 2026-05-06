"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  initialMonths: number;
};

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
    /* ignore */
  }
  return "Request failed.";
}

export function MedicationOrderCoverageCard({ initialMonths }: Props) {
  const router = useRouter();
  const [monthsText, setMonthsText] = useState(String(initialMonths));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <section
      aria-labelledby="med-coverage-heading"
      className="rounded-xl border border-[color-mix(in_srgb,var(--line-subtle)_85%,transparent)] bg-[var(--bg-elevated)] p-5 shadow-[0_1px_0_color-mix(in_srgb,var(--line-subtle)_55%,transparent)]"
    >
      <h2
        id="med-coverage-heading"
        className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]"
      >
        Medication orders
      </h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Months of cover used when building resident medication orders: ordered
        quantity uses{" "}
        <span className="font-medium text-[var(--text-primary)]">
          max(0, (minimum in stock × months) − current stock)
        </span>{" "}
        per active medication that has a minimum set.
      </p>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-[color-mix(in_srgb,#b91c1c_35%,transparent)] bg-[color-mix(in_srgb,#fecaca_22%,transparent)] px-4 py-3 text-sm text-[var(--text-primary)]"
        >
          {error}
        </div>
      ) : null}

      {saved ? (
        <p
          role="status"
          className="mb-4 text-sm font-medium text-pine"
        >
          Saved.
        </p>
      ) : null}

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSaved(false);
          setPending(true);
          try {
            const n = Number.parseInt(monthsText.trim(), 10);
            const res = await fetch("/api/admin/settings/medication-order-coverage", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ medicationOrderCoverageMonths: n }),
            });
            if (!res.ok) {
              setError(await parseError(res));
              return;
            }
            const json = (await res.json()) as {
              medicationOrderCoverageMonths: number;
            };
            setMonthsText(String(json.medicationOrderCoverageMonths));
            setSaved(true);
            router.refresh();
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--text-secondary)]">
            Coverage months (1–36)
          </span>
          <input
            type="number"
            min={1}
            max={36}
            step={1}
            className="rounded-lg border border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] bg-[var(--bg-muted)] px-3 py-2 text-[var(--text-primary)] outline-none ring-[var(--focus-ring)] focus-visible:ring-2"
            value={monthsText}
            onChange={(e) => {
              setMonthsText(e.target.value);
              setSaved(false);
            }}
            disabled={pending}
            aria-required
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] px-5 text-sm font-semibold text-[var(--bg-elevated)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </section>
  );
}
