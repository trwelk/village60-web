"use client";

import type { Home } from "@/lib/homes/service";
import type { WardListItem } from "@/lib/wards/service";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type WardsAdminUIProps = {
  home: Home;
  initialWards: WardListItem[];
  createModalOpen?: boolean;
  onCloseCreateModal?: () => void;
};

function formatMinorAsHomeCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

export function WardsAdminUI({
  home,
  initialWards,
  createModalOpen = false,
  onCloseCreateModal,
}: WardsAdminUIProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [createLabel, setCreateLabel] = useState("");
  const [createSort, setCreateSort] = useState("");
  const [createBeds, setCreateBeds] = useState("");
  const [createMonthlyRate, setCreateMonthlyRate] = useState("");

  const closeCreateModal = useCallback(() => {
    onCloseCreateModal?.();
  }, [onCloseCreateModal]);

  useEffect(() => {
    if (!createModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreateModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [createModalOpen, closeCreateModal]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSort, setEditSort] = useState("");
  const [editBeds, setEditBeds] = useState("");
  const [editMonthlyRate, setEditMonthlyRate] = useState("");

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

  function sortInputToPayload(raw: string): number | null | undefined {
    const t = raw.trim();
    if (t === "") return undefined;
    const n = Number(t);
    if (!Number.isFinite(n)) return undefined;
    return n;
  }

  /** Empty → omit; valid non-negative integer → number; invalid → null sentinel for caller to reject. */
  function monthlyRateInputToPayload(
    raw: string,
  ): number | null | undefined | "invalid" {
    const t = raw.trim();
    if (t === "") return undefined;
    const n = Number(t);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return "invalid";
    }
    return n;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const sortOrder = sortInputToPayload(createSort);
    const body: {
      label: string;
      sortOrder?: number | null;
      bedCount?: number | null;
      monthlyRatePerPersonMinor?: number | null;
    } = {
      label: createLabel,
    };
    if (sortOrder !== undefined) {
      body.sortOrder = sortOrder;
    }
    if (createBeds.trim() !== "") {
      const n = Number(createBeds.trim());
      if (!Number.isInteger(n) || n < 0) {
        setError("Number of beds must be a non-negative whole number or empty.");
        return;
      }
      body.bedCount = n;
    }
    const ratePayload = monthlyRateInputToPayload(createMonthlyRate);
    if (ratePayload === "invalid") {
      setError(
        "Monthly rate (minor units) must be a non-negative whole number or empty.",
      );
      return;
    }
    if (ratePayload !== undefined) {
      body.monthlyRatePerPersonMinor = ratePayload;
    }
    const res = await fetch(`/api/homes/${home.id}/wards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    setCreateLabel("");
    setCreateSort("");
    setCreateBeds("");
    setCreateMonthlyRate("");
    closeCreateModal();
    router.refresh();
  }

  function startEdit(w: WardListItem) {
    setEditingId(w.id);
    setEditLabel(w.label);
    setEditSort(
      w.sortOrder == null ? "" : String(w.sortOrder),
    );
    setEditBeds(w.bedCount == null ? "" : String(w.bedCount));
    setEditMonthlyRate(
      w.monthlyRatePerPersonMinor == null
        ? ""
        : String(w.monthlyRatePerPersonMinor),
    );
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditSort("");
    setEditBeds("");
    setEditMonthlyRate("");
  }

  async function onSaveEdit(wardId: string) {
    setError(null);
    const sortOrder = sortInputToPayload(editSort);
    const body: {
      label: string;
      sortOrder?: number | null;
      bedCount?: number | null;
      monthlyRatePerPersonMinor?: number | null;
    } = {
      label: editLabel,
    };
    if (editSort.trim() === "") {
      body.sortOrder = null;
    } else if (sortOrder !== undefined) {
      body.sortOrder = sortOrder;
    }
    if (editBeds.trim() === "") {
      body.bedCount = null;
    } else {
      const n = Number(editBeds.trim());
      if (!Number.isInteger(n) || n < 0) {
        setError("Number of beds must be a non-negative whole number or empty.");
        return;
      }
      body.bedCount = n;
    }
    const editRatePayload = monthlyRateInputToPayload(editMonthlyRate);
    if (editRatePayload === "invalid") {
      setError(
        "Monthly rate (minor units) must be a non-negative whole number or empty.",
      );
      return;
    }
    if (editMonthlyRate.trim() === "") {
      body.monthlyRatePerPersonMinor = null;
    } else if (editRatePayload !== undefined) {
      body.monthlyRatePerPersonMinor = editRatePayload;
    }
    const res = await fetch(`/api/homes/${home.id}/wards/${wardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    cancelEdit();
    router.refresh();
  }

  async function setArchived(wardId: string, archived: boolean) {
    setError(null);
    const res = await fetch(`/api/homes/${home.id}/wards/${wardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    router.refresh();
  }

  return (
    <>
      {error && !createModalOpen ? <p className="village-alert-error">{error}</p> : null}

      <section className="village-card p-6 sm:p-8">
        <h2 className="village-section-title">Wards for this home</h2>
        <div className="village-table-wrap mt-5">
          <table className="village-table">
            <thead className="village-thead">
              <tr>
                <th className="village-th">Label</th>
                <th className="village-th">Sort</th>
                <th className="village-th">Beds</th>
                <th className="village-th">Monthly / person</th>
                <th className="village-th">Status</th>
                <th className="village-th">Actions</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {initialWards.length === 0 ? (
                <tr>
                  <td colSpan={6} className="village-td-muted py-10 text-center">
                    No wards yet.
                  </td>
                </tr>
              ) : (
                initialWards.map((w) => (
                  <tr key={w.id}>
                    <td className="village-td font-medium">
                      {editingId === w.id ? (
                        <input
                          className="village-input w-full min-w-[10rem]"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                        />
                      ) : (
                        w.label
                      )}
                    </td>
                    <td className="village-td-muted">
                      {editingId === w.id ? (
                        <input
                          className="village-input w-24"
                          value={editSort}
                          onChange={(e) => setEditSort(e.target.value)}
                          inputMode="numeric"
                        />
                      ) : w.sortOrder == null ? (
                        "—"
                      ) : (
                        w.sortOrder
                      )}
                    </td>
                    <td className="village-td-muted">
                      {editingId === w.id ? (
                        <input
                          className="village-input w-24"
                          value={editBeds}
                          onChange={(e) => setEditBeds(e.target.value)}
                          inputMode="numeric"
                          placeholder="—"
                        />
                      ) : w.bedCount == null ? (
                        "—"
                      ) : (
                        w.bedCount
                      )}
                    </td>
                    <td className="village-td-muted text-xs sm:text-sm">
                      {editingId === w.id ? (
                        <input
                          className="village-input w-full min-w-[7rem]"
                          value={editMonthlyRate}
                          onChange={(e) => setEditMonthlyRate(e.target.value)}
                          inputMode="numeric"
                          placeholder="minor units"
                        />
                      ) : w.monthlyRatePerPersonMinor == null ? (
                        "—"
                      ) : (
                        <span className="block">
                          <span className="font-medium text-ink">
                            {formatMinorAsHomeCurrency(
                              w.monthlyRatePerPersonMinor,
                              home.defaultCurrencyCode,
                            )}
                          </span>
                          <span className="mt-0.5 block text-ink/60">
                            {w.monthlyRatePerPersonMinor} minor
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="village-td-muted">
                      {w.archivedAtUtcMs != null ? "Archived" : "Active"}
                    </td>
                    <td className="village-td">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {editingId === w.id ? (
                          <>
                            <button
                              type="button"
                              className="village-btn-primary px-3 py-1.5 text-xs"
                              onClick={() => onSaveEdit(w.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="village-btn-secondary px-3 py-1.5 text-xs"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="village-link cursor-pointer border-0 bg-transparent p-0"
                            onClick={() => startEdit(w)}
                          >
                            Edit
                          </button>
                        )}
                        {w.archivedAtUtcMs != null ? (
                          <button
                            type="button"
                            className="text-sm font-semibold text-pine underline decoration-terracotta/35 underline-offset-[5px] transition hover:text-terracotta"
                            onClick={() => setArchived(w.id, false)}
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4 hover:opacity-90"
                            onClick={() => setArchived(w.id, true)}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {createModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss add ward dialog"
                onClick={closeCreateModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="wards-create-modal-heading"
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] shadow-[0_-8px_40px_-12px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl sm:shadow-[0_22px_60px_-24px_color-mix(in_srgb,var(--text-primary)_38%,transparent)]"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                            New ward
                          </p>
                          <h2
                            id="wards-create-modal-heading"
                            className="font-display text-xl font-normal tracking-tight text-[var(--text-primary)]"
                          >
                            Add a ward or unit
                          </h2>
                          <p className="text-sm leading-6 text-[var(--text-secondary)]">
                            Create a ward for {home.name}.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)]"
                          onClick={closeCreateModal}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <form
                      className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4"
                      onSubmit={onCreate}
                    >
                      <div className="flex flex-col gap-2">
                        <label htmlFor="ward-label" className="village-label">
                          Label
                        </label>
                        <input
                          id="ward-label"
                          className="village-input"
                          value={createLabel}
                          onChange={(e) => setCreateLabel(e.target.value)}
                          required
                          autoComplete="off"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label htmlFor="ward-sort" className="village-label">
                          Sort
                        </label>
                        <input
                          id="ward-sort"
                          className="village-input"
                          value={createSort}
                          onChange={(e) => setCreateSort(e.target.value)}
                          placeholder="optional"
                          inputMode="numeric"
                          autoComplete="off"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label htmlFor="ward-beds" className="village-label">
                          Beds
                        </label>
                        <input
                          id="ward-beds"
                          className="village-input"
                          value={createBeds}
                          onChange={(e) => setCreateBeds(e.target.value)}
                          placeholder="optional"
                          inputMode="numeric"
                          autoComplete="off"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label htmlFor="ward-rate" className="village-label">
                          Monthly rate / person (minor)
                        </label>
                        <input
                          id="ward-rate"
                          className="village-input"
                          value={createMonthlyRate}
                          onChange={(e) => setCreateMonthlyRate(e.target.value)}
                          placeholder="optional"
                          inputMode="numeric"
                          autoComplete="off"
                        />
                      </div>
                      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center lg:col-span-4">
                        <button
                          className="village-btn-primary min-h-10 px-5"
                          type="submit"
                          disabled={!createLabel.trim()}
                        >
                          Add ward
                        </button>
                        {error ? (
                          <p className="text-sm font-medium text-[var(--danger)]">
                            {error}
                          </p>
                        ) : null}
                      </div>
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
