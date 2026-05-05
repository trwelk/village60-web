"use client";

import type { SessionUserRole } from "@/lib/session";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

type LowStockLine = {
  residentMedicationId: string;
  medicationId: string;
  name: string;
  strength: string;
  unit: string;
  currentStock: number;
  minimumInStock: number;
  deficit: number;
  suggestedOrderQty: number;
  hasOpenOrder: boolean;
};

type ResidentGroup = {
  residentId: string;
  residentFullName: string;
  lines: LowStockLine[];
};

type Props = {
  homeId: string;
  homeLabel: string;
  role: SessionUserRole;
};

function severityBorderClass(maxDeficit: number): string {
  if (maxDeficit >= 10) {
    return "border-l-[color:color-mix(in_srgb,#dc2626_72%,transparent)]";
  }
  if (maxDeficit >= 4) {
    return "border-l-[color:color-mix(in_srgb,#d97706_65%,transparent)]";
  }
  return "border-l-[color:color-mix(in_srgb,var(--highlight)_45%,transparent)]";
}

export function HomeLowStockClient({ homeId, homeLabel, role }: Props) {
  const router = useRouter();
  const sectionId = useId();
  const [coverageMonths, setCoverageMonths] = useState<number | null>(null);
  const [groups, setGroups] = useState<ResidentGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"deficit" | "name">("deficit");
  const [orderBusyId, setOrderBusyId] = useState<string | null>(null);
  const [orderMessageByResident, setOrderMessageByResident] = useState<
    Record<string, string | null>
  >({});

  const ordersBase = `/dashboard/homes/${encodeURIComponent(homeId)}/medications/orders`;
  const apiUrl = `/api/homes/${encodeURIComponent(homeId)}/medications/low-stock`;
  const ordersApiUrl = `/api/homes/${encodeURIComponent(homeId)}/medications/orders`;

  const canPlaceOrders = role === "admin" || role === "care";

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(j?.error ?? "Failed to load low stock.");
    }
    const body = (await res.json()) as {
      medicationOrderCoverageMonths: number;
      groups: ResidentGroup[];
    };
    setCoverageMonths(body.medicationOrderCoverageMonths);
    setGroups(body.groups);
  }, [apiUrl]);

  useEffect(() => {
    void load().catch((e) => {
      setLoadError(e instanceof Error ? e.message : "Load failed.");
    });
  }, [load]);

  const sortedGroups = useMemo(() => {
    if (!groups) return [];
    if (sortBy === "name") {
      return [...groups].sort((a, b) =>
        a.residentFullName.localeCompare(b.residentFullName, undefined, {
          sensitivity: "base",
        }),
      );
    }
    return groups;
  }, [groups, sortBy]);

  async function makeOrder(residentId: string) {
    setOrderBusyId(residentId);
    setOrderMessageByResident((m) => ({ ...m, [residentId]: null }));
    try {
      const res = await fetch(ordersApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentId, lowStockOnly: true }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; order?: { id: string } }
        | null;
      if (res.status === 409) {
        setOrderMessageByResident((prev) => ({
          ...prev,
          [residentId]: body?.error ?? "Nothing to order.",
        }));
        return;
      }
      if (!res.ok) {
        setOrderMessageByResident((prev) => ({
          ...prev,
          [residentId]: body?.error ?? "Request failed.",
        }));
        return;
      }
      const orderId = body && "order" in body && body.order ? body.order.id : null;
      if (!orderId) {
        setOrderMessageByResident((prev) => ({
          ...prev,
          [residentId]: "Unexpected response from server.",
        }));
        return;
      }
      router.push(`${ordersBase}/${encodeURIComponent(orderId)}`);
      router.refresh();
    } catch (e) {
      setOrderMessageByResident((prev) => ({
        ...prev,
        [residentId]: e instanceof Error ? e.message : "Request failed.",
      }));
    } finally {
      setOrderBusyId(null);
    }
  }

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <div className="village-reveal relative isolate rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] px-5 py-6 shadow-[0_22px_60px_-36px_color-mix(in_srgb,var(--accent)_42%,transparent)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-1/2 rounded-r-3xl bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_24%,transparent),transparent_46%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--highlight)_20%,transparent),transparent_42%)]" />
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--accent-strong)]">
            Clinical
          </p>
          <h1 className="village-page-title text-4xl">Low stock</h1>
          <p className="max-w-2xl text-sm leading-6 text-[color:color-mix(in_srgb,var(--text-primary)_22%,var(--text-secondary)_78%)]">
            Residents with active medications below their minimum stock target (
            {homeLabel.trim() || "home"}). Suggested reorder uses{" "}
            {coverageMonths ?? "…"} months of cover when applicable.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link
              href={`/dashboard/homes/${encodeURIComponent(homeId)}/residents`}
              className="font-medium text-[var(--highlight)] underline underline-offset-2"
            >
              Back to residents
            </Link>
            <Link
              href={ordersBase}
              className="font-medium text-[var(--highlight)] underline underline-offset-2"
            >
              Medication orders
            </Link>
            <Link
              href={`/dashboard/medications?homeId=${encodeURIComponent(homeId)}`}
              className="font-medium text-[var(--highlight)] underline underline-offset-2"
            >
              Formulary
            </Link>
          </p>
        </div>
      </div>

      <section
        aria-labelledby={sectionId}
        className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id={sectionId} className="text-lg font-semibold">
              Below minimum
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[color:color-mix(in_srgb,var(--text-primary)_28%,var(--text-secondary)_72%)]">
              Only active prescriptions with a minimum stock target are listed. Use Make order
              to create or merge into an open pending or approved order for that resident.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink/80">Sort by</span>
            <select
              className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[var(--bg-page)] px-3 py-2"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value === "name" ? "name" : "deficit")
              }
            >
              <option value="deficit">Severity</option>
              <option value="name">Resident name</option>
            </select>
          </label>
        </div>

        {loadError ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
            {loadError}
          </p>
        ) : null}

        {groups === null ? (
          <p className="village-muted mt-6 text-sm">Loading…</p>
        ) : sortedGroups.length === 0 ? (
          <p className="mt-6 text-sm text-[color:color-mix(in_srgb,var(--text-primary)_35%,var(--text-secondary)_65%)]">
            No medications are below minimum for this home right now.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-5">
            {sortedGroups.map((g) => {
              const maxDeficit = Math.max(...g.lines.map((l) => l.deficit));
              const border = severityBorderClass(maxDeficit);
              const msg = orderMessageByResident[g.residentId];
              return (
                <li
                  key={g.residentId}
                  className={`rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_40%,transparent)] border-l-4 bg-[var(--bg-page)] ${border} p-4 sm:p-5`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
                        {g.residentFullName}
                      </h3>
                      <p className="mt-0.5 text-xs text-ink/55">
                        {g.lines.length} medication{g.lines.length === 1 ? "" : "s"} below min
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`${ordersBase}?residentId=${encodeURIComponent(g.residentId)}`}
                        className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] px-3 py-1.5 text-sm font-medium text-[var(--highlight)] transition hover:bg-ink/[0.04]"
                      >
                        View orders
                      </Link>
                      {canPlaceOrders ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
                          disabled={orderBusyId === g.residentId}
                          onClick={() => void makeOrder(g.residentId)}
                        >
                          {orderBusyId === g.residentId ? "Working…" : "Make order"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {msg ? (
                    <p
                      className="mt-3 rounded-lg bg-ink/[0.06] px-3 py-2 text-sm text-[var(--text-primary)]"
                      role="status"
                    >
                      {msg}
                    </p>
                  ) : null}

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-[32rem] w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/60">
                          <th className="py-2 pr-3 font-medium">Medication</th>
                          <th className="py-2 pr-3 font-medium">Stock</th>
                          <th className="py-2 pr-3 font-medium">Min</th>
                          <th className="py-2 pr-3 font-medium">Shortfall</th>
                          <th className="py-2 font-medium">Suggested order qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.lines.map((ln) => (
                          <tr
                            key={ln.residentMedicationId}
                            className="border-b border-ink/[0.06]"
                          >
                            <td className="py-2.5 pr-3 font-medium">
                              {ln.name}{" "}
                              <span className="font-normal text-ink/75">
                                {ln.strength} {ln.unit}
                              </span>
                              {ln.hasOpenOrder && (
                                <span className="ml-2 inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20">
                                  Order created
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pr-3 tabular-nums">{ln.currentStock}</td>
                            <td className="py-2.5 pr-3 tabular-nums">{ln.minimumInStock}</td>
                            <td className="py-2.5 pr-3 tabular-nums text-red-700 dark:text-red-400">
                              {ln.deficit.toFixed(
                                Number.isInteger(ln.deficit) ? 0 : 1,
                              )}
                            </td>
                            <td className="py-2.5 tabular-nums text-ink/85">
                              {ln.suggestedOrderQty}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
