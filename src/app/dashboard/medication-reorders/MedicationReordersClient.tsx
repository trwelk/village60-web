"use client";

import {
  VillageList,
  VillageListEmpty,
  VillageListFilter,
} from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  dashboardMedicationReordersHref,
  dashboardResidentMedicationsHref,
} from "@/lib/dashboard/dashboardRoutes";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { AppLocale } from "@/lib/i18n/locales";
import { translateWith } from "@/lib/i18n/messages";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type HomeOption = {
  homeId: string;
  homeName: string;
  medLowStockDaysThreshold: number;
  medLowStockServingsThreshold: number;
  medReorderDaysSupply: number;
  medReorderServingsSupply: number;
};

type SupplierOption = { id: string; name: string };

type LowStockItem = {
  residentId: string;
  residentName: string;
  residentMedicationId: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantityPerServing: number;
  prn: boolean;
  slotsPerDay: number | null;
  dailyBurn: number | null;
  onHandBaseUnits: number;
  pendingIncomingBaseUnits: number;
  effectiveOnHandBaseUnits: number;
  daysRemaining: number | null;
  servingsRemaining: number | null;
  threshold: number;
  urgency: "critical" | "warning";
  suggestedOrderQuantityBaseUnits: number;
};

type Props = {
  homes: HomeOption[];
  selectedHomeId: string;
};

const MODAL_PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent-strong)_78%,transparent)] bg-gradient-to-br from-[color:color-mix(in_srgb,var(--accent)_72%,var(--highlight)_28%)] to-[var(--accent-strong)] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--highlight)_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,var(--accent-strong)_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100 min-h-10";

const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color:color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

function purchaseOrderDetailHref(homeId: string, purchaseOrderId: string): string {
  return `/dashboard/inventory-orders/${encodeURIComponent(purchaseOrderId)}?homeId=${encodeURIComponent(homeId)}`;
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function formatRemaining(
  item: LowStockItem,
  t: (key: string) => string,
  locale: AppLocale,
): string {
  if (item.prn && item.servingsRemaining != null) {
    return translateWith(locale, "medicationReorders.servingsUnit", {
      count: formatQuantity(item.servingsRemaining),
    });
  }
  if (item.daysRemaining != null) {
    return translateWith(locale, "medicationReorders.daysUnit", {
      count: formatQuantity(item.daysRemaining),
    });
  }
  return "—";
}

function formatDailyUsage(
  item: LowStockItem,
  t: (key: string) => string,
  locale: AppLocale,
): string {
  if (item.prn) return t("common.prn");
  if (item.dailyBurn == null) return "—";
  return translateWith(locale, "medicationReorders.unitPerDay", {
    amount: formatQuantity(item.dailyBurn),
    unit: item.unit,
  });
}

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

function urgencyPillClass(urgency: LowStockItem["urgency"]): string {
  if (urgency === "critical") {
    return "border-[color:color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]";
  }
  return "border-[color:color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]";
}

export function MedicationReordersClient({ homes, selectedHomeId }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "critical" | "warning">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const activeHome = useMemo(
    () => homes.find((h) => h.homeId === selectedHomeId) ?? null,
    [homes, selectedHomeId],
  );

  const itemKey = (item: LowStockItem) =>
    `${item.residentMedicationId}:${item.itemId}`;

  const loadItems = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(
      `/api/homes/${selectedHomeId}/medication-reorders`,
      { cache: "no-store" },
    );
    setLoading(false);
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { items: LowStockItem[] };
    setItems(json.items);
    setSelectedKeys(new Set());
  }, [selectedHomeId]);

  const loadSuppliers = useCallback(async () => {
    const res = await fetch("/api/inventory-suppliers", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { suppliers: SupplierOption[] };
    setSuppliers(json.suppliers);
    setSupplierId((current) => current || json.suppliers[0]?.id || "");
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setItems([]);
      void loadItems();
      void loadSuppliers();
    });
  }, [loadItems, loadSuppliers]);

  useEffect(() => {
    if (!createOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCreateOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [createOpen]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (urgencyFilter !== "all" && item.urgency !== urgencyFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.residentName.toLowerCase().includes(q) ||
        item.itemName.toLowerCase().includes(q)
      );
    });
  }, [items, urgencyFilter, searchQuery]);

  const activeFilterCount =
    (urgencyFilter !== "all" ? 1 : 0) + (searchQuery.trim() ? 1 : 0);

  const selectedItems = useMemo(() => {
    if (selectedKeys.size === 0) return filteredItems;
    return filteredItems.filter((item) => selectedKeys.has(itemKey(item)));
  }, [filteredItems, selectedKeys]);

  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedKeys.has(itemKey(item)));

  function toggleItem(item: LowStockItem) {
    const key = itemKey(item);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const item of filteredItems) {
          next.delete(itemKey(item));
        }
        return next;
      });
      return;
    }
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of filteredItems) {
        next.add(itemKey(item));
      }
      return next;
    });
  }

  async function createPurchaseOrder() {
    if (!selectedHomeId || !supplierId || submitting) return;
    const linesToOrder =
      selectedKeys.size > 0
        ? items.filter((item) => selectedKeys.has(itemKey(item)))
        : items;
    if (linesToOrder.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/purchase-orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplierId }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const json = (await res.json()) as { purchaseOrder?: { id?: string } };
      const poId = json.purchaseOrder?.id;
      if (!poId) {
        setError(t("medicationReorders.noIdReturned"));
        return;
      }

      for (const item of linesToOrder) {
        const lineRes = await fetch(`/api/purchase-orders/${poId}/lines`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            itemId: item.itemId,
            ownerType: "RESIDENT",
            ownerId: item.residentId,
            purchaseUnitType: item.unit,
            quantityOrderedBaseUnits: item.suggestedOrderQuantityBaseUnits,
          }),
        });
        if (!lineRes.ok) {
          setError(await parseError(lineRes));
          router.push(purchaseOrderDetailHref(selectedHomeId, poId));
          return;
        }
      }

      setCreateOpen(false);
      router.push(purchaseOrderDetailHref(selectedHomeId, poId));
    } finally {
      setSubmitting(false);
    }
  }

  if (homes.length === 0) {
    return (
      <div className="rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-8 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)]">
        {t("dashboard.noHomeAccess")}
      </div>
    );
  }

  const poButtonDisabled = submitting || !supplierId;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {t("medicationReorders.title")}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          {translateWith(locale, "medicationReorders.description", {
            days: activeHome?.medLowStockDaysThreshold ?? 5,
            servings: activeHome?.medLowStockServingsThreshold ?? 5,
            orderDays: activeHome?.medReorderDaysSupply ?? 14,
            orderServings: activeHome?.medReorderServingsSupply ?? 10,
          })}
        </p>
      </header>

      <VillageList
        rootElement="div"
        wrapBody="table"
        listTitle={null}
        filtersCollapsible
        activeFilterCount={activeFilterCount}
        error={error && !createOpen ? error : null}
        loading={loading}
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3">
              <Link
                href={`/dashboard/inventory-orders?homeId=${encodeURIComponent(selectedHomeId)}`}
                className="village-btn-secondary shrink-0"
              >
                {t("medicationReorders.inventoryOrders")}
              </Link>
              <button
                type="button"
                className="h-10 shrink-0 rounded-full border border-[color-mix(in_srgb,var(--accent-strong)_72%,transparent)] bg-[var(--accent-strong)] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] disabled:bg-[color:color-mix(in_srgb,var(--bg-muted)_84%,transparent)] disabled:text-[var(--text-muted)]"
                disabled={items.length === 0 || submitting}
                onClick={() => {
                  setError(null);
                  setCreateOpen(true);
                }}
              >
                {selectedKeys.size > 0
                  ? translateWith(locale, "medicationReorders.createPurchaseOrderCount", { count: selectedKeys.size })
                  : items.length > 0
                    ? t("medicationReorders.createPurchaseOrderAll")
                    : t("medicationReorders.createPurchaseOrder")}
              </button>
              <button
                type="button"
                className="village-btn-secondary shrink-0"
                onClick={() => void loadItems()}
              >
                {t("buttons.refresh")}
              </button>
            </div>
          </div>
        }
        filters={
          <>
            {homes.length > 1 ? (
              <VillageListFilter
                label={t("filters.home")}
                htmlFor="med-reorders-home"
                minWidth="12rem"
              >
                <VillageSelect
                  id="med-reorders-home"
                  value={selectedHomeId}
                  onChange={(nextId) =>
                    router.push(dashboardMedicationReordersHref(nextId))
                  }
                  options={homes.map((h) => ({
                    value: h.homeId,
                    label: h.homeName,
                  }))}
                />
              </VillageListFilter>
            ) : (
              <VillageListFilter label={t("filters.home")} htmlFor="med-reorders-home-ro">
                <input
                  id="med-reorders-home-ro"
                  className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
                  readOnly
                  value={activeHome?.homeName ?? ""}
                />
              </VillageListFilter>
            )}
            <VillageListFilter
              label={t("medicationReorders.urgency")}
              htmlFor="med-reorders-urgency"
              minWidth="10rem"
            >
              <VillageSelect
                id="med-reorders-urgency"
                value={urgencyFilter}
                onChange={(v) =>
                  setUrgencyFilter(v as "all" | "critical" | "warning")
                }
                options={[
                  { value: "all", label: t("medicationReorders.allUrgencies") },
                  { value: "critical", label: t("medicationReorders.critical") },
                  { value: "warning", label: t("medicationReorders.warning") },
                ]}
              />
            </VillageListFilter>
            <VillageListFilter
              label={t("filters.search")}
              htmlFor="med-reorders-search"
              minWidth="14rem"
            >
              <input
                id="med-reorders-search"
                className="village-input"
                placeholder={t("medicationReorders.residentOrMedication")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </VillageListFilter>
          </>
        }
      >
        <table className="village-table">
          <thead className="village-thead">
            <tr>
              <th className="village-th w-10">
                <input
                  type="checkbox"
                  aria-label={t("medicationReorders.selectAll")}
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  disabled={filteredItems.length === 0}
                />
              </th>
              <th className="village-th">{t("medicationReorders.resident")}</th>
              <th className="village-th">{t("medicationReorders.medication")}</th>
              <th className="village-th">{t("medicationReorders.onHand")}</th>
              <th className="village-th">{t("medicationReorders.dailyUsage")}</th>
              <th className="village-th">{t("medicationReorders.remaining")}</th>
              <th className="village-th">{t("medicationReorders.suggestedOrder")}</th>
              <th className="village-th">{t("medicationReorders.urgency")}</th>
            </tr>
          </thead>
          <tbody className="village-tbody">
            {filteredItems.length === 0 ? (
              <VillageListEmpty
                colSpan={8}
                message={
                  items.length === 0
                    ? t("medicationReorders.wellStocked")
                    : t("medicationReorders.noMatch")
                }
              />
            ) : (
              filteredItems.map((item) => {
                const key = itemKey(item);
                return (
                  <tr
                    key={key}
                    className="transition-colors hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_76%,transparent)]"
                  >
                    <td className="px-5 py-4 sm:px-6">
                      <input
                        type="checkbox"
                        aria-label={translateWith(locale, "medicationReorders.selectItem", { item: item.itemName, resident: item.residentName })}
                        checked={selectedKeys.has(key)}
                        onChange={() => toggleItem(item)}
                      />
                    </td>
                    <td className="px-5 py-4 font-medium text-[var(--text-primary)] sm:px-6">
                      <Link
                        href={dashboardResidentMedicationsHref(item.residentId)}
                        className="hover:text-[var(--accent-strong)] hover:underline"
                      >
                        {item.residentName}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-[var(--text-secondary)]">
                      {item.itemName}
                      {item.prn ? (
                        <span className="ml-2 rounded-full border border-[color:color-mix(in_srgb,var(--line-subtle)_80%,transparent)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          PRN
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-[var(--text-secondary)]">
                      {formatQuantity(item.onHandBaseUnits)} {item.unit}
                      {item.pendingIncomingBaseUnits > 0 ? (
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                          +{formatQuantity(item.pendingIncomingBaseUnits)}{" "}
                          {item.unit} on order
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-[var(--text-secondary)]">
                      {formatDailyUsage(item, t, locale)}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-[var(--text-secondary)]">
                      {formatRemaining(item, t, locale)}
                    </td>
                    <td className="px-5 py-4 tabular-nums font-medium text-[var(--text-primary)]">
                      {formatQuantity(item.suggestedOrderQuantityBaseUnits)}{" "}
                      {item.unit}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${urgencyPillClass(item.urgency)}`}
                      >
                        {item.urgency}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </VillageList>

      {createOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center bg-[color:color-mix(in_srgb,var(--bg-base)_55%,transparent)] p-4 backdrop-blur-sm sm:items-center"
              role="presentation"
              onClick={() => !submitting && setCreateOpen(false)}
            >
              <div
                className="w-full max-w-lg overflow-hidden rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[var(--bg-elevated)] shadow-[0_24px_64px_-32px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="med-reorder-po-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_80%,transparent)] px-5 py-4 sm:px-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2
                        id="med-reorder-po-title"
                        className="font-display text-lg font-semibold text-[var(--text-primary)]"
                      >
                        {t("medicationReorders.createPurchaseOrder")}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                        {translateWith(
                          locale,
                          selectedItems.length === 1
                            ? "medicationReorders.linesWillBeAdded"
                            : "medicationReorders.linesWillBeAddedPlural",
                          {
                            count: selectedItems.length,
                            home: activeHome?.homeName ?? t("fields.home"),
                          },
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={MODAL_CLOSE_BTN_CLASS}
                      onClick={() => setCreateOpen(false)}
                      disabled={submitting}
                    >
                      {t("buttons.close")}
                    </button>
                  </div>
                </div>
                <div className="grid gap-5 p-5 sm:p-6">
                  <label
                    htmlFor="med-reorder-po-supplier"
                    className="flex max-w-2xl flex-col gap-2"
                  >
                    <span className="village-label">{t("medicationReorders.supplier")}</span>
                    <VillageSelect
                      id="med-reorder-po-supplier"
                      value={supplierId}
                      onChange={setSupplierId}
                      options={suppliers.map((s) => ({
                        value: s.id,
                        label: s.name,
                      }))}
                    />
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      className={MODAL_PRIMARY_BTN_CLASS}
                      disabled={poButtonDisabled}
                      onClick={() => void createPurchaseOrder()}
                    >
                      {submitting ? t("medicationReorders.creating") : t("medicationReorders.createPurchaseOrder")}
                    </button>
                    {error ? (
                      <p className="text-sm font-medium text-[var(--danger)]">
                        {error}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
