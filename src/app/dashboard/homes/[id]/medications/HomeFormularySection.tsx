"use client";

import { MODAL_PRIMARY_BTN_CLASS } from "@/app/dashboard/expenses/ExpenseEditorDialog";
import {
  VillageSelect,
  type VillageSelectOption,
} from "@/components/VillageSelect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

const UNIT_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: "tablet", label: "Tablet" },
  { value: "capsule", label: "Capsule" },
  { value: "item", label: "Item" },
  { value: "mL", label: "mL" },
  { value: "drop", label: "Drop" },
  { value: "patch", label: "Patch" },
  { value: "puff", label: "Puff" },
  { value: "sachet", label: "Sachet" },
  { value: "IU", label: "IU" },
];

const CREATE_UNIT_OPTIONS: VillageSelectOption[] = [
  ...UNIT_PRESET_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  { value: "__other__", label: "Other" },
];

function resolveUnitFromPresets(select: string, other: string): string {
  if (select === "__other__") {
    const t = other.trim();
    if (!t) {
      throw new Error("Custom unit is required when Other is selected.");
    }
    return `Other: ${t}`;
  }
  return select;
}

type CatalogRow = {
  id: string;
  homeId: string;
  name: string;
  strength: string;
  unit: string;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
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

type Props = { homeId: string };

export function HomeFormularySection({ homeId }: Props) {
  const apiBase = `/api/homes/${homeId}/medications`;

  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [filter, setFilter] = useState("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createStrength, setCreateStrength] = useState("");
  const [createUnitSelect, setCreateUnitSelect] = useState("tablet");
  const [createUnitOther, setCreateUnitOther] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStrength, setEditStrength] = useState("");
  const [editUnit, setEditUnit] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    const q = filter.trim();
    const url =
      q === "" ? apiBase : `${apiBase}?q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) {
      setLoadError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { medications: CatalogRow[] };
    setRows(json.medications);
  }, [apiBase, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeCreateModal = useCallback(() => {
    if (createSubmitting) return;
    setCreateModalOpen(false);
  }, [createSubmitting]);

  const openCreateModal = useCallback(() => {
    setActionError(null);
    setCreateName("");
    setCreateStrength("");
    setCreateUnitSelect("tablet");
    setCreateUnitOther("");
    setCreateModalOpen(true);
  }, []);

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

  function beginEdit(row: CatalogRow) {
    setEditId(row.id);
    setEditName(row.name);
    setEditStrength(row.strength);
    setEditUnit(row.unit);
  }

  async function submitCreate(): Promise<void> {
    setActionError(null);
    let unit: string;
    try {
      unit = resolveUnitFromPresets(createUnitSelect, createUnitOther);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Invalid unit.");
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          strength: createStrength,
          unit,
        }),
      });
      if (!res.ok) {
        setActionError(await parseError(res));
        return;
      }
      setCreateModalOpen(false);
      await load();
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function submitEdit(rowId: string): Promise<void> {
    setActionError(null);
    const res = await fetch(`${apiBase}/${encodeURIComponent(rowId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        strength: editStrength,
        unit: editUnit,
      }),
    });
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    setEditId(null);
    await load();
  }

  async function tryDelete(rowId: string): Promise<void> {
    setActionError(null);
    const res = await fetch(`${apiBase}/${encodeURIComponent(rowId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    await load();
  }

  const displayRows = useMemo(() => rows ?? [], [rows]);

  const table = (
    <div className="overflow-x-auto">
      <table className="min-w-[28rem] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/60">
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Strength</th>
            <th className="py-2 pr-3 font-medium">Unit</th>
            <th className="py-2 font-medium sr-only">Actions</th>
          </tr>
        </thead>
        <tbody className="text-ink/90">
          {displayRows.map((row) =>
            editId === row.id ? (
              <tr key={row.id} className="border-b border-ink/10 align-top">
                <td className="py-2 pr-3">
                  <label className="sr-only" htmlFor={`formulary-edit-name-${row.id}`}>
                    Name
                  </label>
                  <input
                    id={`formulary-edit-name-${row.id}`}
                    className="village-input w-full min-w-[8rem]"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </td>
                <td className="py-2 pr-3">
                  <label
                    className="sr-only"
                    htmlFor={`formulary-edit-strength-${row.id}`}
                  >
                    Strength
                  </label>
                  <input
                    id={`formulary-edit-strength-${row.id}`}
                    className="village-input w-full min-w-[8rem]"
                    value={editStrength}
                    onChange={(e) => setEditStrength(e.target.value)}
                  />
                </td>
                <td className="py-2 pr-3">
                  <label className="sr-only" htmlFor={`formulary-edit-unit-${row.id}`}>
                    Unit
                  </label>
                  <input
                    id={`formulary-edit-unit-${row.id}`}
                    className="village-input w-full min-w-[6rem]"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                  />
                </td>
                <td className="py-2 whitespace-nowrap text-right">
                  <button
                    type="button"
                    className="village-btn-outline text-xs mr-2"
                    onClick={() => setEditId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="village-btn-primary text-xs"
                    onClick={() => void submitEdit(row.id)}
                  >
                    Save
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={row.id} className="border-b border-ink/10">
                <td className="py-2 pr-3 font-medium text-ink">{row.name}</td>
                <td className="py-2 pr-3">{row.strength}</td>
                <td className="py-2 pr-3">{row.unit}</td>
                <td className="py-2 whitespace-nowrap text-right">
                  <button
                    type="button"
                    className="village-btn-outline text-xs mr-2"
                    onClick={() => beginEdit(row)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="village-btn-outline text-xs text-terracotta border-terracotta/40"
                    onClick={() => void tryDelete(row.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
          {displayRows.length === 0 && rows !== null ? (
            <tr>
              <td colSpan={4} className="py-4 text-sm text-ink/60 italic">
                No formulary medications yet. Use Add medication or adjust your
                search.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <section
      aria-labelledby={`formulary-heading-${homeId}`}
      className="village-card p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <h2
            id={`formulary-heading-${homeId}`}
            className="text-lg font-semibold text-ink"
          >
            Home formulary
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink/70">
            Product entries for this home ({`name · strength · unit`}). Rows can
            exist before anyone is prescribed them.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:ml-auto sm:w-auto sm:max-w-md sm:flex-row sm:items-end sm:justify-end">
          <button
            type="button"
            className="village-btn-primary shrink-0 px-3 py-1.5 text-sm sm:order-2"
            onClick={openCreateModal}
          >
            Add medication
          </button>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-xs sm:order-1">
            <span className="village-field-label">Search formulary</span>
            <input
              type="search"
              className="village-input"
              placeholder="Name, strength, or unit…"
              value={filter}
              aria-label="Search formulary"
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
        </div>
      </div>

      {loadError ? <p className="village-alert-error mt-4">{loadError}</p> : null}
      {actionError && !createModalOpen ? (
        <p className="village-alert-error mt-4">{actionError}</p>
      ) : null}

      {rows === null ? (
        <p className="village-muted mt-6">Loading formulary…</p>
      ) : (
        <div className="mt-6">{table}</div>
      )}

      {createModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss add medication dialog"
                onClick={closeCreateModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-formulary-modal-heading"
                data-testid="add-formulary-modal-panel"
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] shadow-[0_-8px_40px_-12px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl sm:shadow-[0_22px_60px_-24px_color-mix(in_srgb,var(--text-primary)_38%,transparent)]"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex max-w-2xl gap-4">
                          <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine text-lg font-display text-cream shadow-[0_14px_34px_-20px_rgba(26,77,58,0.8)]">
                            +
                          </div>
                          <div className="flex flex-col gap-1">
                            <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
                              Home formulary
                            </p>
                            <h2
                              id="add-formulary-modal-heading"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              Add medication
                            </h2>
                            <p className="text-sm leading-6 text-ink/65">
                              Create a catalog product for this home so it can be
                              prescribed to residents.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={MODAL_CLOSE_BTN_CLASS}
                          onClick={closeCreateModal}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-5 p-5 sm:p-6">
                      {actionError ? (
                        <p className="village-alert-error">{actionError}</p>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5 text-sm">
                          <span className="village-field-label">Name</span>
                          <input
                            className="village-input"
                            value={createName}
                            onChange={(e) => {
                              setCreateName(e.target.value);
                              setActionError(null);
                            }}
                            placeholder="Name"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm">
                          <span className="village-field-label">Strength</span>
                          <input
                            className="village-input"
                            value={createStrength}
                            onChange={(e) => {
                              setCreateStrength(e.target.value);
                              setActionError(null);
                            }}
                            placeholder="Strength"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm">
                          <span className="village-field-label">Unit</span>
                          <VillageSelect
                            className="w-full"
                            ariaLabel="Unit"
                            value={createUnitSelect}
                            onChange={(v) => {
                              setCreateUnitSelect(v);
                              setActionError(null);
                            }}
                            options={CREATE_UNIT_OPTIONS}
                          />
                        </label>
                        {createUnitSelect === "__other__" ? (
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="village-field-label">Custom unit</span>
                            <input
                              className="village-input"
                              aria-label="Custom unit"
                              value={createUnitOther}
                              onChange={(e) => {
                                setCreateUnitOther(e.target.value);
                                setActionError(null);
                              }}
                              placeholder="Describe unit"
                            />
                          </label>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          className={MODAL_PRIMARY_BTN_CLASS}
                          disabled={createSubmitting}
                          onClick={() => void submitCreate()}
                        >
                          {createSubmitting ? "Saving…" : "Save product"}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
