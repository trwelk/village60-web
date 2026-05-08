"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { VillageSelect } from "@/components/VillageSelect";
import { formatCents } from "@/lib/money";

const MODAL_PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,#c2410c_78%,transparent)] bg-gradient-to-br from-[#fdba74] to-[#ea580c] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,#fef3c7_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,#c2410c_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100 min-h-10";
const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

type HomeOption = { homeId: string; homeName: string };
type SupplierOption = { id: string; name: string };
type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierName: string;
  status: string;
  currencyCode: string | null;
  totalReceivedCents: number;
  createdAtUtcMs?: number;
};

type Props = { homes: HomeOption[]; selectedHomeId: string };

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

export function InventoryOrdersClient({ homes, selectedHomeId }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const activeHome = useMemo(
    () => homes.find((h) => h.homeId === selectedHomeId) ?? null,
    [homes, selectedHomeId],
  );

  const loadOrders = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/homes/${selectedHomeId}/purchase-orders`, { cache: "no-store" });
    setLoading(false);
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { purchaseOrders: PurchaseOrder[] };
    setOrders(json.purchaseOrders);
  }, [selectedHomeId]);

  const loadSuppliers = useCallback(async () => {
    const res = await fetch("/api/inventory-suppliers", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { suppliers: SupplierOption[] };
    setSuppliers(json.suppliers);
    setSupplierId((current) => current || json.suppliers[0]?.id || "");
  }, []);

  useEffect(() => {
    void loadOrders();
    void loadSuppliers();
  }, [loadOrders, loadSuppliers]);

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

  async function createOrder() {
    if (!selectedHomeId || !supplierId || submitting) return;
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
      const createdId = json.purchaseOrder?.id;
      setCreateOpen(false);
      if (createdId) {
        router.push(`/dashboard/inventory-orders/${encodeURIComponent(createdId)}`);
        return;
      }
      await loadOrders();
    } finally {
      setSubmitting(false);
    }
  }

  if (homes.length === 0) {
    return <div className="village-card p-8">You do not have access to any homes.</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {error && !createOpen ? <p className="village-alert-error">{error}</p> : null}

      <section className="village-card relative overflow-hidden p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[minmax(15rem,22rem),1fr]">
          <label className="flex flex-col gap-2 text-sm">
            <span className="village-field-label">Home</span>
            <VillageSelect
              value={selectedHomeId}
              onChange={(nextId) =>
                router.push(`/dashboard/inventory-orders?homeId=${encodeURIComponent(nextId)}`)
              }
              options={homes.map((h) => ({ value: h.homeId, label: h.homeName }))}
            />
          </label>
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[linear-gradient(130deg,color-mix(in_srgb,var(--bg-muted)_86%,var(--bg-elevated)_14%),color-mix(in_srgb,var(--highlight)_12%,var(--bg-muted)_88%))] p-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Selected home
            </p>
            <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              {activeHome?.homeName ?? "Unknown home"}
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Review purchase orders, create a new order, then open it to manage lines.
            </p>
          </div>
        </div>
      </section>

      <section className="village-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold">Inventory orders</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {orders.length} order{orders.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/inventory-orders/catalog?homeId=${encodeURIComponent(selectedHomeId)}`}
              className="village-button inline-flex text-sm"
            >
              Open item catalog
            </Link>
            <button
              type="button"
              className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
            >
              Create inventory order
            </button>
          </div>
        </div>
        {!loading && orders.length === 0 ? (
          <div className="px-5 py-10 text-center sm:px-6">
            <p className="text-base font-medium text-[var(--text-primary)]">No purchase orders yet.</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Use <span className="font-semibold text-[var(--text-primary)]">Create inventory order</span>{" "}
              to open your first PO.
            </p>
          </div>
        ) : null}
        {orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[var(--text-secondary)]">
                  <th className="px-5 py-3 font-medium sm:px-6">PO number</th>
                  <th className="px-5 py-3 font-medium">Supplier</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Received cost</th>
                  <th className="px-5 py-3 font-medium text-right sm:px-6">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-[var(--line)]/85 align-top">
                    <td className="px-5 py-3 font-medium text-[var(--text-primary)] sm:px-6">
                      {order.poNumber}
                    </td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{order.supplierName}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {order.currencyCode && order.totalReceivedCents > 0
                        ? formatCents(order.totalReceivedCents, order.currencyCode)
                        : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right sm:px-6">
                      <Link
                        href={`/dashboard/inventory-orders/${encodeURIComponent(order.id)}`}
                        className="village-button inline-flex"
                      >
                        Open order
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {createOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss create inventory order dialog"
                onClick={() => setCreateOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="po-create-modal-heading"
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
                              New purchase order
                            </p>
                            <h2
                              id="po-create-modal-heading"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              Create inventory order
                            </h2>
                            <p className="text-sm leading-6 text-ink/65">
                              Choose a supplier and create a draft PO for this home.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={MODAL_CLOSE_BTN_CLASS}
                          onClick={() => setCreateOpen(false)}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-5 p-5 sm:p-6">
                      <label htmlFor="po-create-supplier" className="flex max-w-2xl flex-col gap-2">
                        <span className="village-label">Supplier</span>
                        <VillageSelect
                          id="po-create-supplier"
                          value={supplierId}
                          onChange={setSupplierId}
                          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                        />
                      </label>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          className={MODAL_PRIMARY_BTN_CLASS}
                          disabled={submitting || !supplierId}
                          onClick={() => void createOrder()}
                        >
                          {submitting ? "Creating..." : "Create inventory order"}
                        </button>
                        {error ? <p className="text-sm font-medium text-terracotta">{error}</p> : null}
                      </div>
                    </div>
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
