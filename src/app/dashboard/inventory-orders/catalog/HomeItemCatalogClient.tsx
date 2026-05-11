"use client";

import { VillageList, VillageListFilter } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import { PencilLine, Plus, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const MODAL_PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,#c2410c_78%,transparent)] bg-gradient-to-br from-[#fdba74] to-[#ea580c] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,#fef3c7_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,#c2410c_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100 min-h-10";

const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

type HomeOption = { homeId: string; homeName: string };
type Item = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  baseUnit: string;
  unitClass: "countable" | "measurable";
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};
type Category = {
  id: string;
  name: string;
};

type Props = {
  homes: HomeOption[];
  selectedHomeId: string;
};

type Draft = {
  categoryId: string;
  name: string;
  baseUnit: string;
  unitClass: "countable" | "measurable";
};

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string") return err;
    }
  } catch {
    // ignore
  }
  return "Request failed.";
}

function defaultDraft(): Draft {
  return { categoryId: "", name: "", baseUnit: "", unitClass: "countable" };
}

export function HomeItemCatalogClient({ homes, selectedHomeId }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");

  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [createDraft, setCreateDraft] = useState<Draft>(defaultDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(defaultDraft);
  const [categoryFilterId, setCategoryFilterId] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");

  const activeHome = useMemo(
    () => homes.find((h) => h.homeId === selectedHomeId) ?? null,
    [homes, selectedHomeId],
  );

  const filteredItems = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilterId && item.categoryId !== categoryFilterId)
        return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q)
      );
    });
  }, [items, categoryFilterId, catalogSearch]);

  const activeFilterCount =
    (categoryFilterId ? 1 : 0) + (catalogSearch.trim() ? 1 : 0);

  const loadCategories = useCallback(async () => {
    if (!selectedHomeId) return;
    const res = await fetch(
      `/api/homes/${selectedHomeId}/inventory-item-categories`,
      {
        cache: "no-store",
      },
    );
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { categories: Category[] };
    setCategories(json.categories);
    setCreateDraft((d) => ({
      ...d,
      categoryId:
        d.categoryId && json.categories.some((c) => c.id === d.categoryId)
          ? d.categoryId
          : (json.categories[0]?.id ?? ""),
    }));
    setEditDraft((d) => ({
      ...d,
      categoryId:
        d.categoryId && json.categories.some((c) => c.id === d.categoryId)
          ? d.categoryId
          : (json.categories[0]?.id ?? ""),
    }));
  }, [selectedHomeId]);

  const loadItems = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/homes/${selectedHomeId}/inventory-items`, {
      cache: "no-store",
    });
    setLoading(false);
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { items: Item[] };
    setItems(json.items);
  }, [selectedHomeId]);

  useEffect(() => {
    setItems([]);
    setEditingId(null);
    setCategoryFilterId("");
    setCatalogSearch("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCategories();
    void loadItems();
  }, [loadCategories, loadItems]);

  const closeCreateItemModal = useCallback(() => {
    setCreateModalOpen(false);
  }, []);

  const openCreateItemModal = useCallback(() => {
    setError(null);
    setCreateModalOpen(true);
  }, []);

  useEffect(() => {
    if (!createModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreateItemModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [createModalOpen, closeCreateItemModal]);

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditDraft({
      name: item.name,
      categoryId: item.categoryId,
      baseUnit: item.baseUnit,
      unitClass: item.unitClass,
    });
  }

  async function createCategory() {
    if (!selectedHomeId || submitting || !newCategoryName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/homes/${selectedHomeId}/inventory-item-categories`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: newCategoryName }),
        },
      );
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setNewCategoryName("");
      await loadCategories();
    } finally {
      setSubmitting(false);
    }
  }

  async function onCreateItemSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedHomeId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/inventory-items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createDraft),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      await loadCategories();
      setCreateDraft((d) => ({ ...defaultDraft(), categoryId: d.categoryId }));
      setNewCategoryName("");
      await loadItems();
      closeCreateItemModal();
    } finally {
      setSubmitting(false);
    }
  }

  async function saveItem(itemId: string) {
    if (!selectedHomeId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/homes/${selectedHomeId}/inventory-items/${itemId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(editDraft),
        },
      );
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setEditingId(null);
      await loadItems();
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteItem(itemId: string) {
    if (!selectedHomeId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/homes/${selectedHomeId}/inventory-items/${itemId}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      if (editingId === itemId) setEditingId(null);
      await loadItems();
    } finally {
      setSubmitting(false);
    }
  }

  if (homes.length === 0) {
    return (
      <div className="village-card p-8">
        You do not have access to any homes.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <VillageList
        rootElement="div"
        wrapBody="none"
        listTitle={null}
        filtersCollapsible
        activeFilterCount={activeFilterCount}
        error={error && !createModalOpen ? error : null}
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
                onClick={openCreateItemModal}
              >
                Add an item
              </button>
            </div>
            <button
              type="button"
              className="village-btn-secondary shrink-0"
              onClick={() => {
                void loadCategories();
                void loadItems();
              }}
            >
              Refresh
            </button>
          </div>
        }
        filters={
          <>
            {homes.length > 1 ? (
              <VillageListFilter
                label="Home"
                htmlFor="catalog-home"
                minWidth="12rem"
              >
                <VillageSelect
                  id="catalog-home"
                  value={selectedHomeId}
                  onChange={(nextId) =>
                    router.push(
                      `/dashboard/inventory-orders/catalog?homeId=${encodeURIComponent(nextId)}`,
                    )
                  }
                  options={homes.map((h) => ({
                    value: h.homeId,
                    label: h.homeName,
                  }))}
                />
              </VillageListFilter>
            ) : (
              <VillageListFilter label="Home" htmlFor="catalog-home-ro">
                <input
                  id="catalog-home-ro"
                  readOnly
                  className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
                  value={activeHome?.homeName ?? ""}
                />
              </VillageListFilter>
            )}
            <VillageListFilter
              label="Category"
              htmlFor="catalog-category"
              minWidth="12rem"
            >
              <VillageSelect
                id="catalog-category"
                value={categoryFilterId}
                onChange={setCategoryFilterId}
                options={[
                  { value: "", label: "All categories" },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </VillageListFilter>
            <VillageListFilter
              label="Item search"
              htmlFor="catalog-search"
              minWidth="12rem"
            >
              <input
                id="catalog-search"
                className="village-input"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Name or category"
                autoComplete="off"
              />
            </VillageListFilter>
          </>
        }
      >
        <section className="village-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold">Catalog list</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {loading && items.length === 0
                  ? "Loading items…"
                  : `${filteredItems.length} item${filteredItems.length === 1 ? "" : "s"} shown`}
                {items.length > 0 && items.length !== filteredItems.length ? (
                  <span className="text-[var(--text-muted)]">
                    {" "}
                    ({items.length} in catalog)
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          {!loading && items.length === 0 ? (
            <div className="px-5 py-10 text-center sm:px-6">
              <p className="text-base font-medium text-[var(--text-primary)]">
                No items yet for this home.
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Use{" "}
                <span className="font-semibold text-[var(--text-primary)]">
                  Add an item
                </span>{" "}
                to create the first catalog row and bootstrap ordering and stock
                operations.
              </p>
            </div>
          ) : null}
          {!loading && items.length > 0 && filteredItems.length === 0 ? (
            <div className="px-5 py-10 text-center sm:px-6">
              <p className="text-base font-medium text-[var(--text-primary)]">
                No items match these filters.
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Clear category or search to see all {items.length} catalog item
                {items.length === 1 ? "" : "s"}.
              </p>
            </div>
          ) : null}
          {items.length > 0 && filteredItems.length > 0 ? (
            <div
              className={[
                "overflow-x-auto",
                loading
                  ? "pointer-events-none opacity-50 transition-opacity duration-150 motion-reduce:transition-none"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[var(--text-secondary)]">
                    <th className="px-5 py-3 font-medium sm:px-6">Category</th>
                    <th className="px-5 py-3 font-medium sm:px-6">Item</th>
                    <th className="px-5 py-3 font-medium">Base unit</th>
                    <th className="px-5 py-3 font-medium">Unit class</th>
                    <th className="px-5 py-3 font-medium text-right sm:px-6">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const isEditing = editingId === item.id;
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-[var(--line)]/85 align-top"
                      >
                        <td className="px-5 py-3 sm:px-6">
                          {isEditing ? (
                            <VillageSelect
                              value={editDraft.categoryId}
                              onChange={(categoryId) =>
                                setEditDraft((d) => ({ ...d, categoryId }))
                              }
                              options={categories.map((c) => ({
                                value: c.id,
                                label: c.name,
                              }))}
                            />
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              {item.categoryName}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 sm:px-6">
                          {isEditing ? (
                            <input
                              className="village-input"
                              value={editDraft.name}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  name: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            <span className="font-medium text-[var(--text-primary)]">
                              {item.name}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <input
                              className="village-input"
                              value={editDraft.baseUnit}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  baseUnit: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              {item.baseUnit}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <VillageSelect
                              value={editDraft.unitClass}
                              onChange={(unitClass) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  unitClass: unitClass as
                                    | "countable"
                                    | "measurable",
                                }))
                              }
                              options={[
                                { value: "countable", label: "countable" },
                                { value: "measurable", label: "measurable" },
                              ]}
                            />
                          ) : (
                            <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                              {item.unitClass}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 sm:px-6">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="village-button village-button-primary village-button--compact inline-flex items-center gap-1"
                                  onClick={() => void saveItem(item.id)}
                                  disabled={submitting}
                                >
                                  <Save size={14} className="shrink-0" aria-hidden />
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="village-button village-button--compact inline-flex items-center gap-1"
                                  onClick={() => setEditingId(null)}
                                  disabled={submitting}
                                >
                                  <X size={14} className="shrink-0" aria-hidden />
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="village-button village-button--compact inline-flex items-center gap-1"
                                  onClick={() => startEdit(item)}
                                  disabled={submitting}
                                >
                                  <PencilLine
                                    size={14}
                                    className="shrink-0"
                                    aria-hidden
                                  />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="village-button village-button-danger village-button--compact inline-flex items-center gap-1"
                                  onClick={() => void deleteItem(item.id)}
                                  disabled={submitting}
                                >
                                  <Trash2
                                    size={14}
                                    className="shrink-0"
                                    aria-hidden
                                  />
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </VillageList>

      {createModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss add catalog item dialog"
                onClick={closeCreateItemModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="catalog-create-modal-heading"
                data-testid="catalog-create-panel"
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
                              New inventory item
                            </p>
                            <h2
                              id="catalog-create-modal-heading"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              Add an item
                            </h2>
                            <p className="text-sm leading-6 text-ink/65">
                              Categories, naming, base units, and quantity class
                              for this home catalog.
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                          <div className="rounded-2xl border border-pine/10 bg-cream/72 px-4 py-3 text-sm text-ink/65 shadow-sm">
                            <span className="font-semibold text-pine-2">
                              {items.length}
                            </span>{" "}
                            catalog item
                            {items.length === 1 ? "" : "s"}
                          </div>
                          <button
                            type="button"
                            className={MODAL_CLOSE_BTN_CLASS}
                            onClick={closeCreateItemModal}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                    <form
                      id="catalog-create-form"
                      className="grid gap-5 p-5 sm:p-6"
                      onSubmit={onCreateItemSubmit}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                        <label
                          htmlFor="catalog-create-category-name"
                          className="flex min-w-[12rem] flex-1 flex-col gap-2"
                        >
                          <span className="village-label">
                            New category name
                          </span>
                          <input
                            id="catalog-create-category-name"
                            className="village-input min-w-0"
                            placeholder="Optional — add before selecting below"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            autoComplete="off"
                          />
                        </label>
                        <button
                          type="button"
                          className="village-btn village-btn-secondary inline-flex min-h-10 shrink-0 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
                          disabled={submitting || !newCategoryName.trim()}
                          onClick={() => void createCategory()}
                        >
                          <Plus size={16} aria-hidden />
                          Add category
                        </button>
                      </div>
                      <label
                        htmlFor="catalog-create-category"
                        className="flex max-w-2xl flex-col gap-2"
                      >
                        <span className="village-label">Category</span>
                        <VillageSelect
                          id="catalog-create-category"
                          value={createDraft.categoryId}
                          onChange={(categoryId) =>
                            setCreateDraft((d) => ({ ...d, categoryId }))
                          }
                          options={categories.map((c) => ({
                            value: c.id,
                            label: c.name,
                          }))}
                        />
                      </label>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <label
                          htmlFor="catalog-create-item-name"
                          className="flex min-w-[12rem] flex-1 flex-col gap-2"
                        >
                          <span className="village-label">Item name</span>
                          <input
                            id="catalog-create-item-name"
                            className="village-input min-w-0"
                            placeholder="Shown on POs and inventory"
                            value={createDraft.name}
                            onChange={(e) =>
                              setCreateDraft((d) => ({
                                ...d,
                                name: e.target.value,
                              }))
                            }
                            required
                            autoComplete="off"
                          />
                        </label>
                        <label
                          htmlFor="catalog-create-base-unit"
                          className="flex min-w-[10rem] flex-1 flex-col gap-2"
                        >
                          <span className="village-label">Base unit</span>
                          <input
                            id="catalog-create-base-unit"
                            className="village-input min-w-0"
                            placeholder="e.g. bottle, tab, ml"
                            value={createDraft.baseUnit}
                            onChange={(e) =>
                              setCreateDraft((d) => ({
                                ...d,
                                baseUnit: e.target.value,
                              }))
                            }
                            required
                            autoComplete="off"
                          />
                        </label>
                      </div>
                      <label
                        htmlFor="catalog-create-unit-class"
                        className="flex max-w-xs flex-col gap-2"
                      >
                        <span className="village-label">Unit type</span>
                        <VillageSelect
                          id="catalog-create-unit-class"
                          value={createDraft.unitClass}
                          onChange={(unitClass) =>
                            setCreateDraft((d) => ({
                              ...d,
                              unitClass: unitClass as
                                | "countable"
                                | "measurable",
                            }))
                          }
                          options={[
                            { value: "countable", label: "countable" },
                            { value: "measurable", label: "measurable" },
                          ]}
                        />
                      </label>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          form="catalog-create-form"
                          type="submit"
                          className={MODAL_PRIMARY_BTN_CLASS}
                          disabled={submitting}
                        >
                          {submitting ? "Creating…" : "Create"}
                        </button>
                        {error ? (
                          <p className="text-sm font-medium text-terracotta">
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
    </div>
  );
}
