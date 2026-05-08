"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDashboardWayfinding } from "@/app/dashboard/DashboardWayfinding";
import { VillageSelect } from "@/components/VillageSelect";
import { Ban, CheckCircle2, PackagePlus, Plus } from "lucide-react";
import { formatCents, parsePriceToCents } from "@/lib/money";

const MODAL_PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,#c2410c_78%,transparent)] bg-gradient-to-br from-[#fdba74] to-[#ea580c] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,#fef3c7_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,#c2410c_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100 min-h-10";
const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

type HomeOption = { homeId: string; homeName: string };
type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierName: string;
  status: string;
  currencyCode: string | null;
  totalReceivedCents: number;
  createdByUserId: string;
  createdAtUtcMs: number;
};
type PoLine = {
  id: string;
  itemId: string;
  itemName: string;
  ownerType: string;
  ownerId: string;
  ownerDisplayName?: string;
  quantityOrderedBaseUnits: number;
  quantityReceivedBaseUnits: number;
  status: string;
  totalReceivedCents: number;
};
type ItemOption = { id: string; name: string; baseUnit: string };

type Props = {
  homes: HomeOption[];
  selectedHomeId: string;
  purchaseOrderId: string;
};

function statusPillClass(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === "DRAFT") {
    return "border-amber-500/55 bg-amber-50 text-amber-800";
  }
  if (normalized === "APPROVED") {
    return "border-sky-500/55 bg-sky-50 text-sky-800";
  }
  if (normalized === "SENT") {
    return "border-indigo-500/55 bg-indigo-50 text-indigo-800";
  }
  if (normalized === "CLOSED") {
    return "border-emerald-500/55 bg-emerald-50 text-emerald-800";
  }
  if (normalized === "CANCELED") {
    return "border-rose-500/55 bg-rose-50 text-rose-800";
  }
  if (normalized === "RECEIVED") {
    return "border-teal-500/55 bg-teal-50 text-teal-800";
  }
  if (normalized === "PARTIALLY_RECEIVED") {
    return "border-violet-500/55 bg-violet-50 text-violet-800";
  }
  return "border-[var(--line)] bg-[var(--bg-muted)] text-[var(--text-secondary)]";
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

function formatUtcDateTime(utcMs?: number): string {
  if (!utcMs || !Number.isFinite(utcMs)) return "Unknown";
  return new Date(utcMs).toLocaleString();
}

export function PurchaseOrderDetailClient({ homes, selectedHomeId, purchaseOrderId }: Props) {
  const router = useRouter();
  const { setHomeBreadcrumbs } = useDashboardWayfinding();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [lines, setLines] = useState<PoLine[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [addLineModalOpen, setAddLineModalOpen] = useState(false);
  const [isSubmittingAddLine, setIsSubmittingAddLine] = useState(false);
  const [itemId, setItemId] = useState("");
  const [ownerType, setOwnerType] = useState<"HOME" | "RESIDENT">("HOME");
  const [ownerId, setOwnerId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [residentPickOpen, setResidentPickOpen] = useState(false);
  const [residentPickList, setResidentPickList] = useState<{ id: string; fullName: string }[]>([]);
  const [residentPickLoading, setResidentPickLoading] = useState(false);
  const [residentSearch, setResidentSearch] = useState("");
  const residentPickerRef = useRef<HTMLDivElement>(null);
  const residentInputRef = useRef<HTMLInputElement>(null);
  const residentPortalListRef = useRef<HTMLUListElement>(null);
  const [residentMenuPos, setResidentMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveLineId, setReceiveLineId] = useState("");
  const [receiveQty, setReceiveQty] = useState("1");
  const [receiveBaseUnits, setReceiveBaseUnits] = useState("1");
  const [receiveUnitPrice, setReceiveUnitPrice] = useState("");
  const [receiveCurrencyCode, setReceiveCurrencyCode] = useState("NZD");
  const [receiveNote, setReceiveNote] = useState("");
  const [isSubmittingReceive, setIsSubmittingReceive] = useState(false);

  const activeOrder = useMemo(
    () => orders.find((order) => order.id === purchaseOrderId) ?? null,
    [orders, purchaseOrderId],
  );
  const selectedHomeName = useMemo(
    () => homes.find((home) => home.homeId === selectedHomeId)?.homeName ?? selectedHomeId,
    [homes, selectedHomeId],
  );
  const normalizedOrderStatus = (activeOrder?.status ?? "").trim().toUpperCase();
  const isClosedOrder = normalizedOrderStatus === "CLOSED";
  const showApprove = normalizedOrderStatus === "DRAFT";
  const showDisapprove = normalizedOrderStatus === "APPROVED";
  const showSend = normalizedOrderStatus === "APPROVED";
  const showDelete = normalizedOrderStatus === "DRAFT";
  const showAddLine = normalizedOrderStatus === "DRAFT" && !isClosedOrder;

  useLayoutEffect(() => {
    const ordersHref = selectedHomeId
      ? `/dashboard/inventory-orders?homeId=${encodeURIComponent(selectedHomeId)}`
      : "/dashboard/inventory-orders";
    setHomeBreadcrumbs([
      { label: "Inventory orders", href: ordersHref, currentPage: false },
      { label: activeOrder?.poNumber ?? "Purchase order", currentPage: true },
    ]);
    return () => {
      setHomeBreadcrumbs(null);
    };
  }, [activeOrder?.poNumber, selectedHomeId, setHomeBreadcrumbs]);

  const updateResidentMenuPos = useCallback(() => {
    const el = residentInputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const pad = 8;
    const spaceBelow = window.innerHeight - r.bottom - gap - pad;
    const maxHeight = Math.min(240, Math.max(120, spaceBelow));
    setResidentMenuPos({ top: r.bottom + gap, left: r.left, width: r.width, maxHeight });
  }, []);

  const loadOrders = useCallback(async () => {
    const res = await fetch(`/api/homes/${selectedHomeId}/purchase-orders`, { cache: "no-store" });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { purchaseOrders: PurchaseOrder[] };
    setOrders(json.purchaseOrders);
  }, [selectedHomeId]);

  const loadItems = useCallback(async () => {
    const res = await fetch(`/api/homes/${selectedHomeId}/inventory-items`);
    if (!res.ok) return;
    const json = (await res.json()) as { items: ItemOption[] };
    setItems(json.items);
    setItemId((prev) => prev || json.items[0]?.id || "");
  }, [selectedHomeId]);

  const loadLines = useCallback(async () => {
    const res = await fetch(`/api/purchase-orders/${purchaseOrderId}`, { cache: "no-store" });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { lines: PoLine[]; totalReceivedCents: number };
    setLines(json.lines);
    const receivableIds = json.lines
      .filter((line) => line.status !== "CLOSED" && line.status !== "CANCELED")
      .map((line) => line.id);
    setReceiveLineId((current) => (receivableIds.includes(current) ? current : (receivableIds[0] ?? "")));
  }, [purchaseOrderId]);

  const fetchResidentsForPicker = useCallback(
    async (query: string) => {
      setResidentPickLoading(true);
      try {
        const params = new URLSearchParams({ status: "active", pageSize: "100", page: "1" });
        if (query.trim()) params.set("query", query.trim());
        const res = await fetch(`/api/homes/${selectedHomeId}/residents?${params}`, { cache: "no-store" });
        if (!res.ok) {
          setResidentPickList([]);
          return;
        }
        const json = (await res.json()) as { residents: { id: string; fullName: string }[] };
        setResidentPickList(json.residents.map((resident) => ({ id: resident.id, fullName: resident.fullName })));
      } finally {
        setResidentPickLoading(false);
      }
    },
    [selectedHomeId],
  );

  useEffect(() => {
    void loadOrders();
    void loadItems();
    void loadLines();
  }, [loadItems, loadLines, loadOrders]);

  useEffect(() => {
    if (!addLineModalOpen || ownerType !== "RESIDENT") return;
    const t = window.setTimeout(() => void fetchResidentsForPicker(residentSearch), 250);
    return () => window.clearTimeout(t);
  }, [addLineModalOpen, ownerType, residentSearch, fetchResidentsForPicker]);

  useEffect(() => {
    if (!residentPickOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (residentPickerRef.current?.contains(target)) return;
      if (residentPortalListRef.current?.contains(target)) return;
      setResidentPickOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [residentPickOpen]);

  useLayoutEffect(() => {
    if (!residentPickOpen) return;
    updateResidentMenuPos();
    window.addEventListener("scroll", updateResidentMenuPos, true);
    window.addEventListener("resize", updateResidentMenuPos);
    return () => {
      window.removeEventListener("scroll", updateResidentMenuPos, true);
      window.removeEventListener("resize", updateResidentMenuPos);
    };
  }, [residentPickOpen, updateResidentMenuPos, residentPickList.length, residentPickLoading]);

  useEffect(() => {
    if (activeOrder?.currencyCode) {
      setReceiveCurrencyCode(activeOrder.currencyCode);
    }
  }, [activeOrder?.currencyCode]);

  useEffect(() => {
    if (!(addLineModalOpen || receiveModalOpen)) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAddLineModalOpen(false);
        setReceiveModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [addLineModalOpen, receiveModalOpen]);

  const receiveLineTotalCents = useMemo(() => {
    const qty = parseFloat(receiveQty);
    const priceCents = parsePriceToCents(receiveUnitPrice);
    if (!Number.isFinite(qty) || qty <= 0 || priceCents === null) return null;
    return Math.round(priceCents * qty);
  }, [receiveQty, receiveUnitPrice]);

  const poTotalReceivedCents = useMemo(
    () => lines.reduce((sum, l) => sum + (l.totalReceivedCents ?? 0), 0),
    [lines],
  );

  async function approve() {
    const res = await fetch(`/api/purchase-orders/${purchaseOrderId}/approve`, { method: "POST" });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    await loadOrders();
  }

  async function disapprove() {
    const res = await fetch(`/api/purchase-orders/${purchaseOrderId}/disapprove`, { method: "POST" });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    await loadOrders();
    router.refresh();
  }

  async function send() {
    const res = await fetch(`/api/purchase-orders/${purchaseOrderId}/send`, { method: "POST" });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    await loadOrders();
  }

  async function deleteOrder() {
    const res = await fetch(`/api/purchase-orders/${purchaseOrderId}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    router.push(`/dashboard/inventory-orders?homeId=${encodeURIComponent(selectedHomeId)}`);
  }

  async function submitAddLine(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingAddLine || !itemId) return;
    setIsSubmittingAddLine(true);
    setError(null);
    try {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError("Quantity ordered must be a positive number.");
        return;
      }
      if (ownerType === "RESIDENT" && !ownerId.trim()) {
        setError("Select a resident from the list.");
        return;
      }
      const resolvedOwnerId = ownerType === "HOME" ? selectedHomeId : ownerId.trim();
      const res = await fetch(`/api/purchase-orders/${purchaseOrderId}/lines`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, ownerType, ownerId: resolvedOwnerId, quantityOrderedBaseUnits: qty }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setOwnerId("");
      setResidentSearch("");
      setQuantity("1");
      await loadLines();
      setAddLineModalOpen(false);
    } finally {
      setIsSubmittingAddLine(false);
    }
  }

  async function receiveLine(e: React.FormEvent) {
    e.preventDefault();
    if (!receiveLineId || isSubmittingReceive) return;
    setIsSubmittingReceive(true);
    setError(null);
    try {
      const priceCents = parsePriceToCents(receiveUnitPrice);
      if (priceCents === null) {
        setError("Unit price must be a positive number (e.g. 12.50).");
        return;
      }
      const res = await fetch(`/api/purchase-orders/${purchaseOrderId}/lines/${receiveLineId}/receive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          qtyReceivedEvent: Number(receiveQty),
          baseUnitsReceivedEvent: Number(receiveBaseUnits),
          unitPriceCents: priceCents,
          currencyCode: receiveCurrencyCode,
          receivedAtUtcMs: Date.now(),
          note: receiveNote.trim() || null,
        }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setReceiveQty("1");
      setReceiveBaseUnits("1");
      setReceiveUnitPrice("");
      setReceiveNote("");
      await Promise.all([loadLines(), loadOrders()]);
      router.refresh();
      setReceiveModalOpen(false);
    } finally {
      setIsSubmittingReceive(false);
    }
  }

  async function closeLine(lineId: string) {
    const res = await fetch(`/api/purchase-orders/${purchaseOrderId}/lines/${lineId}/close`, { method: "POST" });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    await loadLines();
    await loadOrders();
  }

  async function cancelLine(lineId: string) {
    const res = await fetch(`/api/purchase-orders/${purchaseOrderId}/lines/${lineId}/cancel`, { method: "POST" });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    await loadLines();
    await loadOrders();
  }

  if (!activeOrder) {
    return (
      <div className="village-card p-6">
        <p className="text-[var(--text-secondary)]">Purchase order not found for this home.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && !addLineModalOpen && !receiveModalOpen ? <p className="village-alert-error">{error}</p> : null}

      <section className="village-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">{activeOrder.poNumber}</h2>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusPillClass(activeOrder.status)}`}
              >
                {activeOrder.status}
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Supplier: {activeOrder.supplierName} · Home: {selectedHomeName}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Created by: {activeOrder.createdByUserId} · Created:{" "}
              {formatUtcDateTime(activeOrder.createdAtUtcMs)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/inventory-orders?homeId=${encodeURIComponent(selectedHomeId)}`}
              className="village-button"
            >
              Back to orders
            </Link>
            {showApprove ? <button className="village-button" onClick={() => void approve()}>Approve</button> : null}
            {showDisapprove ? <button className="village-button" onClick={() => void disapprove()}>Disapprove</button> : null}
            {showSend ? <button className="village-button village-button-primary" onClick={() => void send()}>Send</button> : null}
            {showDelete ? <button className="village-button village-button-danger" onClick={() => void deleteOrder()}>Delete</button> : null}
          </div>
        </div>
      </section>

      <section className="village-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold">Order lines</h3>
            <p className="text-sm text-[var(--text-secondary)]">{lines.length} line{lines.length === 1 ? "" : "s"}</p>
          </div>
          {showAddLine ? (
            <button className="village-btn-primary shrink-0 px-3 py-1.5 text-sm" onClick={() => setAddLineModalOpen(true)}>
              Add line
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[var(--text-secondary)]">
                <th className="px-5 py-3 font-medium sm:px-6">Item</th>
                <th className="px-5 py-3 font-medium">Owner</th>
                <th className="px-5 py-3 font-medium">Qty ordered</th>
                <th className="px-5 py-3 font-medium">Received</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Received cost</th>
                <th className="px-5 py-3 font-medium text-right sm:px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const canReceive =
                  activeOrder.status === "SENT" && line.status !== "CLOSED" && line.status !== "CANCELED";
                return (
                  <tr key={line.id} className="border-b border-[var(--line)]/85 align-top">
                    <td className="px-5 py-3 font-medium text-[var(--text-primary)] sm:px-6">{line.itemName}</td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{line.ownerType}:{line.ownerDisplayName ?? line.ownerId}</td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{line.quantityOrderedBaseUnits}</td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{line.quantityReceivedBaseUnits}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusPillClass(line.status)}`}
                      >
                        {line.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {activeOrder.currencyCode && line.totalReceivedCents > 0
                        ? formatCents(line.totalReceivedCents, activeOrder.currencyCode)
                        : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right sm:px-6">
                      <div className="flex justify-end gap-2">
                        {canReceive ? (
                          <button className="village-button village-button-primary text-xs min-h-9 px-3 py-2" onClick={() => { setReceiveLineId(line.id); setReceiveModalOpen(true); }}>
                            <PackagePlus size={16} aria-hidden />
                            Receive
                          </button>
                        ) : null}
                        <button className="village-button text-xs min-h-9 px-3 py-2" disabled={!canReceive} onClick={() => void closeLine(line.id)}>
                          <CheckCircle2 size={16} aria-hidden />
                          Close
                        </button>
                        <button className="village-button village-button-danger text-xs min-h-9 px-3 py-2" disabled={!canReceive} onClick={() => void cancelLine(line.id)}>
                          <Ban size={16} aria-hidden />
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[var(--text-secondary)] sm:px-6">
                    No lines on this purchase order.
                  </td>
                </tr>
              ) : null}
              {lines.length > 0 && poTotalReceivedCents > 0 ? (
                <tr className="border-t-2 border-[var(--line)] bg-[color:color-mix(in_srgb,var(--bg-muted)_40%,transparent)]">
                  <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-[var(--text-secondary)] sm:px-6">
                    Total received
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-sm font-bold text-[var(--text-primary)]">
                    {activeOrder.currencyCode
                      ? formatCents(poTotalReceivedCents, activeOrder.currencyCode)
                      : poTotalReceivedCents}
                  </td>
                  <td className="px-5 py-3 sm:px-6" />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {addLineModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button type="button" className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]" onClick={() => setAddLineModalOpen(false)} />
              <div role="dialog" aria-modal="true" className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex max-w-2xl gap-4">
                          <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine text-cream"><Plus size={22} /></div>
                          <div>
                            <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">{activeOrder.poNumber}</p>
                            <h2 className="text-xl font-semibold tracking-tight text-pine-2">Add purchase order line</h2>
                          </div>
                        </div>
                        <button type="button" className={MODAL_CLOSE_BTN_CLASS} onClick={() => setAddLineModalOpen(false)}>Close</button>
                      </div>
                    </div>
                    <form className="grid gap-5 p-5 sm:p-6" onSubmit={submitAddLine}>
                      <label className="flex max-w-2xl flex-col gap-2">
                        <span className="village-label">Item</span>
                        <VillageSelect value={itemId} onChange={setItemId} options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.baseUnit})` }))} />
                      </label>
                      <label className="flex max-w-xs flex-col gap-2">
                        <span className="village-label">Owner type</span>
                        <VillageSelect value={ownerType} onChange={(v) => { const next = v as "HOME" | "RESIDENT"; setOwnerType(next); setOwnerId(""); setResidentSearch(""); setResidentPickOpen(false); }} options={[{ value: "HOME", label: "HOME" }, { value: "RESIDENT", label: "RESIDENT" }]} />
                      </label>
                      {ownerType === "HOME" ? (
                        <label className="flex max-w-2xl flex-col gap-2">
                          <span className="village-label">Owner (home)</span>
                          <input className="village-input min-w-0" readOnly value={selectedHomeName} />
                        </label>
                      ) : (
                        <div className="flex max-w-2xl flex-col gap-2">
                          <label className="flex flex-col gap-2">
                            <span className="village-label">Resident</span>
                            <div ref={residentPickerRef} className="relative">
                              <input ref={residentInputRef} className="village-input min-w-0" placeholder="Search by name..." value={residentSearch} onChange={(e) => { setResidentSearch(e.target.value); setOwnerId(""); setResidentPickOpen(true); }} onFocus={() => { setResidentPickOpen(true); void fetchResidentsForPicker(residentSearch); }} />
                            </div>
                          </label>
                        </div>
                      )}
                      <label className="flex max-w-xs flex-col gap-2">
                        <span className="village-label">Qty ordered</span>
                        <input className="village-input min-w-0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required inputMode="decimal" />
                      </label>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button type="submit" className={MODAL_PRIMARY_BTN_CLASS} disabled={isSubmittingAddLine || !itemId || (ownerType === "RESIDENT" && !ownerId.trim())}>{isSubmittingAddLine ? "Adding..." : "Add line"}</button>
                        {error ? <p className="text-sm font-medium text-terracotta">{error}</p> : null}
                      </div>
                    </form>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {addLineModalOpen && ownerType === "RESIDENT" && residentPickOpen && residentMenuPos
        ? createPortal(
            <ul
              ref={residentPortalListRef}
              role="listbox"
              className="fixed z-[260] overflow-y-auto rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_46%,transparent)] bg-[var(--bg-elevated)] py-1.5 text-[var(--text-primary)] shadow-[0_18px_48px_-20px_color-mix(in_srgb,var(--text-primary)_32%,transparent)] ring-1 ring-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
              style={{ top: residentMenuPos.top, left: Math.max(8, Math.min(residentMenuPos.left, window.innerWidth - 8 - residentMenuPos.width)), width: residentMenuPos.width, maxHeight: residentMenuPos.maxHeight }}
            >
              {residentPickLoading ? (
                <li className="px-3 py-2 text-sm text-[var(--text-secondary)]">Searching...</li>
              ) : residentPickList.length === 0 ? (
                <li className="px-3 py-2 text-sm text-[var(--text-secondary)]">No matching active residents.</li>
              ) : (
                residentPickList.map((resident) => (
                  <li key={resident.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={ownerId === resident.id}
                      className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[color:color-mix(in_srgb,var(--accent)_7%,var(--bg-muted)_93%)]"
                      onMouseDown={(evt) => evt.preventDefault()}
                      onClick={() => { setOwnerId(resident.id); setResidentSearch(resident.fullName); setResidentPickOpen(false); }}
                    >
                      {resident.fullName}
                    </button>
                  </li>
                ))
              )}
            </ul>,
            document.body,
          )
        : null}

      {receiveModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button type="button" className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]" onClick={() => setReceiveModalOpen(false)} />
              <div role="dialog" aria-modal="true" className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">{activeOrder.poNumber}</p>
                          <h2 className="text-xl font-semibold tracking-tight text-pine-2">Receive inventory line</h2>
                        </div>
                        <button type="button" className={MODAL_CLOSE_BTN_CLASS} onClick={() => setReceiveModalOpen(false)}>Close</button>
                      </div>
                    </div>
                    <form className="grid gap-5 p-5 sm:p-6" onSubmit={receiveLine}>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <label className="flex flex-col gap-2">
                          <span className="village-label">Qty received</span>
                          <input
                            className="village-input min-w-0"
                            value={receiveQty}
                            onChange={(e) => setReceiveQty(e.target.value)}
                            inputMode="decimal"
                            required
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="village-label">Base units</span>
                          <input
                            className="village-input min-w-0"
                            value={receiveBaseUnits}
                            onChange={(e) => setReceiveBaseUnits(e.target.value)}
                            inputMode="decimal"
                            required
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="village-label">Unit price</span>
                          <div className="relative flex items-center">
                            <span className="pointer-events-none absolute left-3 select-none text-sm text-[var(--text-muted)]">
                              {receiveCurrencyCode}
                            </span>
                            <input
                              className="village-input min-w-0 pl-12"
                              value={receiveUnitPrice}
                              onChange={(e) => setReceiveUnitPrice(e.target.value)}
                              placeholder="0.00"
                              inputMode="decimal"
                              required
                            />
                          </div>
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="village-label">
                            Currency
                            {activeOrder.currencyCode ? (
                              <span className="ml-1.5 text-[0.65rem] font-normal uppercase tracking-wide text-[var(--text-muted)]">(locked)</span>
                            ) : null}
                          </span>
                          {activeOrder.currencyCode ? (
                            <div className="village-input min-w-0 flex items-center bg-[color:color-mix(in_srgb,var(--bg-muted)_60%,transparent)] text-[var(--text-secondary)]">
                              {activeOrder.currencyCode}
                            </div>
                          ) : (
                            <input
                              className="village-input min-w-0"
                              value={receiveCurrencyCode}
                              onChange={(e) => setReceiveCurrencyCode(e.target.value.toUpperCase())}
                              maxLength={3}
                              required
                            />
                          )}
                        </label>
                      </div>
                      {receiveLineTotalCents !== null ? (
                        <div className="flex items-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_50%,transparent)] px-4 py-3">
                          <span className="text-sm text-[var(--text-secondary)]">Line total</span>
                          <span className="ml-auto tabular-nums text-base font-semibold text-[var(--text-primary)]">
                            {formatCents(receiveLineTotalCents, receiveCurrencyCode)}
                          </span>
                        </div>
                      ) : null}
                      <label className="flex flex-col gap-2">
                        <span className="village-label">Note (optional)</span>
                        <input className="village-input min-w-0" value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} />
                      </label>
                      <button type="submit" className={MODAL_PRIMARY_BTN_CLASS} disabled={isSubmittingReceive || !receiveLineId}>
                        {isSubmittingReceive ? "Receiving..." : "Receive inventory"}
                      </button>
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
