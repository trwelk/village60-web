"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type HomeRow = {
  id: string;
  name: string;
  medLowStockDaysThreshold: number;
  medLowStockServingsThreshold: number;
  medReorderDaysSupply: number;
  medReorderServingsSupply: number;
};

type Props = {
  homes: HomeRow[];
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
    // ignore
  }
  return "Request failed.";
}

export function AdminSettingsClient({ homes }: Props) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      homes.map((h) => [
        h.id,
        {
          medLowStockDaysThreshold: String(h.medLowStockDaysThreshold),
          medLowStockServingsThreshold: String(h.medLowStockServingsThreshold),
          medReorderDaysSupply: String(h.medReorderDaysSupply),
          medReorderServingsSupply: String(h.medReorderServingsSupply),
        },
      ]),
    ),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function saveHome(homeId: string) {
    const draft = drafts[homeId];
    if (!draft) return;

    setSavingId(homeId);
    setError(null);
    setSavedId(null);

    const res = await fetch(`/api/homes/${homeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        medLowStockDaysThreshold: Number.parseInt(
          draft.medLowStockDaysThreshold,
          10,
        ),
        medLowStockServingsThreshold: Number.parseInt(
          draft.medLowStockServingsThreshold,
          10,
        ),
        medReorderDaysSupply: Number.parseInt(draft.medReorderDaysSupply, 10),
        medReorderServingsSupply: Number.parseInt(
          draft.medReorderServingsSupply,
          10,
        ),
      }),
    });

    setSavingId(null);
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }

    setSavedId(homeId);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Admin settings
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          Per-home medication reorder rules. Warning thresholds control when
          items appear on{" "}
          <Link
            href="/dashboard/medication-reorders"
            className="font-medium text-[var(--accent-strong)] underline decoration-[color:color-mix(in_srgb,var(--accent-strong)_35%,transparent)] underline-offset-2 hover:decoration-[var(--accent-strong)]"
          >
            Reorder meds
          </Link>
          ; order targets control the suggested purchase quantity.
        </p>
      </header>

      {error ? <p className="village-alert-error">{error}</p> : null}

      <section className="rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-6 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Medication reorder settings
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Low-stock values trigger warnings. Order-for values set how much
              stock a suggested PO line should cover.
            </p>
          </div>
          <Link
            href="/dashboard/homes"
            className="village-btn-secondary shrink-0 self-start"
          >
            Manage homes
          </Link>
        </div>

        {homes.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No homes yet. Add a home under{" "}
            <Link href="/dashboard/homes" className="text-[var(--accent-strong)]">
              Retirement homes
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="village-table">
              <thead className="village-thead">
                <tr>
                  <th className="village-th">Home</th>
                  <th className="village-th">Warn (days)</th>
                  <th className="village-th">Warn (servings)</th>
                  <th className="village-th">Order for (days)</th>
                  <th className="village-th">Order for (servings)</th>
                  <th className="village-th">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="village-tbody">
                {homes.map((home) => {
                  const draft = drafts[home.id];
                  const isSaving = savingId === home.id;
                  const isSaved = savedId === home.id;
                  return (
                    <tr key={home.id}>
                      <td className="px-5 py-4 font-medium text-[var(--text-primary)] sm:px-6">
                        {home.name}
                      </td>
                      <td className="px-5 py-4 sm:px-6">
                        <input
                          type="number"
                          min={1}
                          className="village-input w-20 tabular-nums"
                          aria-label={`${home.name} low stock days warning`}
                          value={draft?.medLowStockDaysThreshold ?? ""}
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [home.id]: {
                                ...current[home.id]!,
                                medLowStockDaysThreshold: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-5 py-4 sm:px-6">
                        <input
                          type="number"
                          min={1}
                          className="village-input w-20 tabular-nums"
                          aria-label={`${home.name} low stock servings warning`}
                          value={draft?.medLowStockServingsThreshold ?? ""}
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [home.id]: {
                                ...current[home.id]!,
                                medLowStockServingsThreshold: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-5 py-4 sm:px-6">
                        <input
                          type="number"
                          min={1}
                          className="village-input w-20 tabular-nums"
                          aria-label={`${home.name} reorder days supply`}
                          value={draft?.medReorderDaysSupply ?? ""}
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [home.id]: {
                                ...current[home.id]!,
                                medReorderDaysSupply: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-5 py-4 sm:px-6">
                        <input
                          type="number"
                          min={1}
                          className="village-input w-20 tabular-nums"
                          aria-label={`${home.name} reorder servings supply`}
                          value={draft?.medReorderServingsSupply ?? ""}
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [home.id]: {
                                ...current[home.id]!,
                                medReorderServingsSupply: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-5 py-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="village-button village-button-primary village-button--compact"
                            disabled={isSaving}
                            onClick={() => void saveHome(home.id)}
                          >
                            {isSaving ? "Saving…" : "Save"}
                          </button>
                          {isSaved ? (
                            <span className="text-xs font-medium text-success">
                              Saved
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
