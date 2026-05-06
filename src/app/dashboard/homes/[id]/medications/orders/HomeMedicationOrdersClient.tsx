"use client";

import type { SessionUserRole } from "@/lib/session";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

type OrderListRow = {
  id: string;
  residentId: string;
  residentFullName: string;
  status: string;
  updatedAtUtcMs: number;
};

type ReceiptEvt = {
  id: string;
  amount: number;
  createdAtUtcMs: number;
  idempotencyKey: string | null;
};

type LineDetail = {
  id: string;
  residentMedicationId: string;
  orderedQty: number;
  orderUnitLabel?: string | null;
  receivedQty?: number;
  closedShortAtUtcMs?: number | null;
  closedShortReason?: string | null;
  medicationId: string;
  name: string;
  strength: string;
  unit: string;
  receiptEvents?: ReceiptEvt[];
};

type OrderDetail = {
  order: {
    id: string;
    status: string;
    completedAtUtcMs?: number | null;
    orderPlacedAtUtcMs?: number | null;
  };
  lines: LineDetail[];
};

type ResidentOption = { id: string; fullName: string };

type Props = {
  homeId: string;
  homeLabel: string;
  role: SessionUserRole;
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-[color:color-mix(in_srgb,var(--highlight)_18%,transparent)] text-[var(--text-primary)]";
    case "approved":
      return "bg-[color:color-mix(in_srgb,#16a34a_22%,transparent)] text-[var(--text-primary)]";
    case "order_placed":
      return "bg-[color:color-mix(in_srgb,#2563eb_20%,transparent)] text-[var(--text-primary)]";
    case "completed":
      return "bg-[color:color-mix(in_srgb,#0d9488_22%,transparent)] text-[var(--text-primary)]";
    case "rejected":
      return "bg-[color:color-mix(in_srgb,#dc2626_20%,transparent)] text-[var(--text-primary)]";
    case "cancelled":
      return "bg-ink/10 text-ink/80";
    default:
      return "bg-ink/10";
  }
}

export function HomeMedicationOrdersClient({ homeId, homeLabel, role }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = useId();
  const [orders, setOrders] = useState<OrderListRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [residents, setResidents] = useState<ResidentOption[]>([]);
  const [selectedResidentId, setSelectedResidentId] = useState<string>("");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildBusy, setBuildBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lineDraft, setLineDraft] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [receiveDraft, setReceiveDraft] = useState<Record<string, string>>({});
  const [closeShortDraft, setCloseShortDraft] = useState<Record<string, string>>({});
  const isAdmin = role === "admin";
  const canReceive = isAdmin || role === "care";

  const ordersUrl = useMemo(
    () => `/api/homes/${encodeURIComponent(homeId)}/medications/orders`,
    [homeId],
  );

  const loadOrders = useCallback(async () => {
    setLoadError(null);
    const u = new URL(ordersUrl, "http://local");
    if (statusFilter) u.searchParams.set("status", statusFilter);
    const res = await fetch(u.pathname + u.search, { cache: "no-store" });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(j?.error ?? "Failed to load orders.");
    }
    const body = (await res.json()) as { orders: OrderListRow[] };
    setOrders(body.orders);
  }, [ordersUrl, statusFilter]);

  useEffect(() => {
    void loadOrders().catch((e) => {
      setLoadError(e instanceof Error ? e.message : "Load failed.");
    });
  }, [loadOrders]);

  useEffect(() => {
    const param = searchParams.get("residentId")?.trim();
    if (param) {
      setSelectedResidentId(param);
    }
  }, [searchParams]);

  useEffect(() => {
    const orderId = searchParams.get("openOrder")?.trim();
    if (!orderId || orders.length === 0) return;
    if (orders.some((o) => o.id === orderId)) {
      setExpandedId(orderId);
    }
  }, [searchParams, orders]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/residents?status=active&pageSize=500`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as {
        residents: { id: string; fullName: string }[];
      };
      setResidents(body.residents.map((r) => ({ id: r.id, fullName: r.fullName })));
    })();
  }, [homeId]);

  useEffect(() => {
    if (!expandedId) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    setDetail(null);
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `${ordersUrl}/${encodeURIComponent(expandedId)}`,
          { cache: "no-store", signal: ac.signal },
        );
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? "Failed to load order.");
        }
        const d = (await res.json()) as OrderDetail;
        if (ac.signal.aborted) return;
        setDetail(d);
        const draft: Record<string, string> = {};
        const recv: Record<string, string> = {};
        for (const ln of d.lines) {
          draft[ln.residentMedicationId] = String(ln.orderedQty);
          recv[ln.id] = "";
        }
        setLineDraft(draft);
        setReceiveDraft(recv);
      } finally {
        if (!ac.signal.aborted) {
          setDetailLoading(false);
        }
      }
    })();
    return () => ac.abort();
  }, [expandedId, ordersUrl]);

  async function postAction(path: string, key: string) {
    setActionBusy(key);
    setBuildError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Request failed.");
      }
      setExpandedId(null);
      await loadOrders();
      router.refresh();
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function submitBuild() {
    if (!selectedResidentId) {
      setBuildError("Select a resident.");
      return;
    }
    setBuildBusy(true);
    setBuildError(null);
    try {
      const checkStatuses = ["pending", "approved"] as const;
      for (const status of checkStatuses) {
        const checkUrl = new URL(ordersUrl, "http://local");
        checkUrl.searchParams.set("residentId", selectedResidentId);
        checkUrl.searchParams.set("status", status);
        const res = await fetch(checkUrl.pathname + checkUrl.search, { cache: "no-store" });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? "Failed to open order.");
        }
        const body = (await res.json()) as { orders: OrderListRow[] };
        if (body.orders.length > 0) {
          router.push(
            `/dashboard/homes/${encodeURIComponent(homeId)}/medications/orders/${encodeURIComponent(body.orders[0]!.id)}`,
          );
          return;
        }
      }
      router.push(
        `/dashboard/homes/${encodeURIComponent(homeId)}/medications/orders/new?residentId=${encodeURIComponent(selectedResidentId)}`,
      );
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Open order failed.");
    } finally {
      setBuildBusy(false);
    }
  }

  async function postReceive(orderId: string, lineId: string) {
    const raw = receiveDraft[lineId] ?? "";
    const n = Number.parseFloat(String(raw));
    if (Number.isNaN(n) || n <= 0) {
      setBuildError("Received dispensing amount must be a positive number.");
      return;
    }
    setActionBusy(`recv-${lineId}`);
    setBuildError(null);
    try {
      const res = await fetch(
        `${ordersUrl}/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(lineId)}/receive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: n }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Receive failed.");
      }
      const d = (await res.json()) as OrderDetail;
      setDetail(d);
      setReceiveDraft((r) => ({ ...r, [lineId]: "" }));
      await loadOrders();
      router.refresh();
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Receive failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function postCloseShort(orderId: string, lineId: string) {
    const reason = (closeShortDraft[lineId] ?? "").trim();
    if (!reason) {
      setBuildError("Enter a reason to close the line short.");
      return;
    }
    setActionBusy(`short-${lineId}`);
    setBuildError(null);
    try {
      const res = await fetch(
        `${ordersUrl}/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(lineId)}/close-short`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Close short failed.");
      }
      const d = (await res.json()) as OrderDetail;
      setDetail(d);
      setCloseShortDraft((c) => ({ ...c, [lineId]: "" }));
      await loadOrders();
      router.refresh();
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Close short failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function postPlaceOrder(orderId: string) {
    setActionBusy(`place-${orderId}`);
    setBuildError(null);
    try {
      const res = await fetch(`${ordersUrl}/${encodeURIComponent(orderId)}/place`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Place order failed.");
      }
      const d = (await res.json()) as OrderDetail;
      setDetail(d);
      await loadOrders();
      router.refresh();
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Place order failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function saveLineQtys(orderId: string) {
    if (!detail) return;
    const lineOrderedQtyByResidentMedicationId: Record<string, number> = {};
    for (const ln of detail.lines) {
      const raw = lineDraft[ln.residentMedicationId];
      const n = Number.parseInt(String(raw), 10);
      if (Number.isNaN(n) || n < 1) {
        setBuildError("Each quantity must be a positive integer.");
        return;
      }
      lineOrderedQtyByResidentMedicationId[ln.residentMedicationId] = n;
    }
    setActionBusy("patch-lines");
    setBuildError(null);
    try {
      const res = await fetch(`${ordersUrl}/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineOrderedQtyByResidentMedicationId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Save failed.");
      }
      const d = (await res.json()) as OrderDetail;
      setDetail(d);
      await loadOrders();
      router.refresh();
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setActionBusy(null);
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
          <h1 className="village-page-title text-4xl">Medication orders</h1>
          <p className="max-w-2xl text-sm leading-6 text-[color:color-mix(in_srgb,var(--text-primary)_22%,var(--text-secondary)_78%)]">
            Build or merge orders from resident med lines with stock targets, approve, place
            with the vendor, then receive stock into the ledger ({homeLabel.trim() || "home"}).
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link
              href={`/dashboard/homes/${encodeURIComponent(homeId)}/residents`}
              className="font-medium text-[var(--highlight)] underline underline-offset-2"
            >
              Back to residents
            </Link>
            <Link
              href={`/dashboard/homes/${encodeURIComponent(homeId)}/medications/low-stock`}
              className="font-medium text-[var(--highlight)] underline underline-offset-2"
            >
              Low stock
            </Link>
          </p>
        </div>
      </div>

      <section
        aria-labelledby={`${formId}-build`}
        className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-5 sm:p-6"
      >
        <h2 id={`${formId}-build`} className="text-lg font-semibold">
          Open manual order
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[color:color-mix(in_srgb,var(--text-primary)_28%,var(--text-secondary)_72%)]">
          Opens existing pending/approved order when present; otherwise starts a new manual
          order builder where lines are created by the user.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-[220px] flex-col gap-1 text-sm">
            <span className="text-ink/80">Resident</span>
            <select
              className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[var(--bg-page)] px-3 py-2 text-[var(--text-primary)]"
              value={selectedResidentId}
              onChange={(e) => setSelectedResidentId(e.target.value)}
            >
              <option value="">Select…</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            disabled={buildBusy}
            onClick={() => void submitBuild()}
          >
            {buildBusy ? "Working…" : "Open order"}
          </button>
        </div>
        {buildError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {buildError}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Orders</h2>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink/80">Status</span>
            <select
              className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[var(--bg-page)] px-3 py-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="order_placed">Order placed</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>

        {loadError ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {loadError}
          </p>
        ) : orders.length === 0 ? (
          <p className="village-muted mt-6 text-sm">No orders yet for this filter.</p>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {orders.map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_40%,transparent)] bg-[var(--bg-page)] p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left font-medium text-[var(--highlight)] underline-offset-2 hover:underline"
                    onClick={() =>
                      setExpandedId((cur) => (cur === o.id ? null : o.id))
                    }
                  >
                    {o.residentFullName}
                  </button>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(o.status)}`}
                  >
                    {o.status}
                  </span>
                  <span className="text-xs text-ink/55">
                    Updated {new Date(o.updatedAtUtcMs).toLocaleString()}
                  </span>
                </div>

                {expandedId === o.id ? (
                  <div className="mt-4 border-t border-[color:color-mix(in_srgb,var(--line-strong)_36%,transparent)] pt-4">
                    {detailLoading ? (
                      <p className="text-sm text-ink/70">Loading lines…</p>
                    ) : detail && detail.order.id === o.id ? (
                      <div className="flex flex-col gap-4">
                        <ul className="flex flex-col gap-3 text-sm">
                          {detail.lines.map((ln) => {
                            const received = ln.receivedQty ?? 0;
                            const closedShort =
                              ln.closedShortAtUtcMs != null ||
                              (ln.closedShortReason != null && ln.closedShortReason.length > 0);
                            const remaining = closedShort
                              ? 0
                              : Math.max(0, ln.orderedQty - received);
                            const receipts = ln.receiptEvents ?? [];
                            const st = detail.order.status;
                            return (
                              <li
                                key={ln.id}
                                className="flex flex-col gap-2 rounded-lg bg-ink/[0.04] px-3 py-3"
                              >
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <span className="font-medium">
                                    {ln.name} {ln.strength} {ln.unit}
                                  </span>
                                  {st === "approved" && isAdmin ? (
                                    <label className="flex items-center gap-2">
                                      <span className="text-ink/65">Qty</span>
                                      <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className="w-24 rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[var(--bg-elevated)] px-2 py-1"
                                        value={lineDraft[ln.residentMedicationId] ?? ""}
                                        onChange={(e) =>
                                          setLineDraft((d) => ({
                                            ...d,
                                            [ln.residentMedicationId]: e.target.value,
                                          }))
                                        }
                                      />
                                    </label>
                                  ) : (
                                    <span className="text-ink/75">
                                      Ordered{" "}
                                      <span className="tabular-nums font-semibold text-[var(--text-primary)]">
                                        {ln.orderedQty}
                                      </span>
                                          {ln.orderUnitLabel ? (
                                            <>
                                              {" "}
                                              {ln.orderUnitLabel}
                                            </>
                                          ) : null}
                                      {st === "order_placed" || st === "completed" ? (
                                        <>
                                          {" "}
                                          · Received{" "}
                                          <span className="tabular-nums font-semibold">
                                            {received}
                                          </span>
                                          {!closedShort ? (
                                            <>
                                              {" "}
                                              · Remaining{" "}
                                              <span className="tabular-nums font-semibold">
                                                {remaining}
                                              </span>
                                            </>
                                          ) : null}
                                        </>
                                      ) : null}
                                    </span>
                                  )}
                                </div>
                                {closedShort && ln.closedShortReason ? (
                                  <p className="text-xs text-ink/70">
                                    Closed short: {ln.closedShortReason}
                                  </p>
                                ) : null}
                                {receipts.length > 0 ? (
                                  <ul className="ml-1 border-l border-[color:color-mix(in_srgb,var(--line-strong)_40%,transparent)] pl-3 text-xs text-ink/75">
                                    {receipts.map((ev) => (
                                      <li key={ev.id} className="tabular-nums">
                                        +{ev.amount} ·{" "}
                                        {new Date(ev.createdAtUtcMs).toLocaleString()}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                {st === "order_placed" && !closedShort ? (
                                  <div className="mt-1 flex flex-col gap-2 border-t border-[color:color-mix(in_srgb,var(--line-strong)_32%,transparent)] pt-2">
                                    {canReceive ? (
                                      <div className="flex flex-wrap items-end gap-2">
                                        <label className="flex items-center gap-2">
                                          <span className="text-ink/65">
                                            Add to stock ({ln.unit})
                                          </span>
                                          <input
                                            type="number"
                                            min={0.01}
                                            step="any"
                                            className="w-20 rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[var(--bg-elevated)] px-2 py-1"
                                            value={receiveDraft[ln.id] ?? ""}
                                            onChange={(e) =>
                                              setReceiveDraft((d) => ({
                                                ...d,
                                                [ln.id]: e.target.value,
                                              }))
                                            }
                                          />
                                        </label>
                                        <button
                                          type="button"
                                          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                          disabled={!!actionBusy}
                                          onClick={() => void postReceive(o.id, ln.id)}
                                        >
                                          Post receipt
                                        </button>
                                      </div>
                                    ) : null}
                                    {isAdmin ? (
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs text-ink/65">
                                          Close line short (reason required)
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                          <input
                                            type="text"
                                            className="min-w-[180px] flex-1 rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[var(--bg-elevated)] px-2 py-1 text-sm"
                                            value={closeShortDraft[ln.id] ?? ""}
                                            onChange={(e) =>
                                              setCloseShortDraft((d) => ({
                                                ...d,
                                                [ln.id]: e.target.value,
                                              }))
                                            }
                                          />
                                          <button
                                            type="button"
                                            className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] px-3 py-1.5 text-xs font-medium hover:bg-ink/[0.04] disabled:opacity-50"
                                            disabled={!!actionBusy}
                                            onClick={() => void postCloseShort(o.id, ln.id)}
                                          >
                                            Close short
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>

                        {detail.order.status === "approved" && isAdmin ? (
                          <button
                            type="button"
                            className="self-start rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] px-3 py-2 text-sm font-medium hover:bg-ink/[0.04] disabled:opacity-50"
                            disabled={actionBusy === "patch-lines"}
                            onClick={() => void saveLineQtys(o.id)}
                          >
                            Save quantities
                          </button>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                          {o.status === "pending" ? (
                            <>
                              {(role === "admin" || role === "care") && (
                                <button
                                  type="button"
                                  className="rounded-lg bg-ink/10 px-3 py-2 text-sm font-medium hover:bg-ink/15 disabled:opacity-50"
                                  disabled={!!actionBusy}
                                  onClick={() =>
                                    void postAction(
                                      `${ordersUrl}/${encodeURIComponent(o.id)}/cancel`,
                                      `cancel-${o.id}`,
                                    )
                                  }
                                >
                                  Cancel
                                </button>
                              )}
                              {isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                    disabled={!!actionBusy}
                                    onClick={() =>
                                      void postAction(
                                        `${ordersUrl}/${encodeURIComponent(o.id)}/approve`,
                                        `approve-${o.id}`,
                                      )
                                    }
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-red-500/40 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50 dark:text-red-400"
                                    disabled={!!actionBusy}
                                    onClick={() =>
                                      void postAction(
                                        `${ordersUrl}/${encodeURIComponent(o.id)}/reject`,
                                        `reject-${o.id}`,
                                      )
                                    }
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </>
                          ) : null}
                          {o.status === "approved" && isAdmin ? (
                            <>
                              <button
                                type="button"
                                className="rounded-lg bg-ink/10 px-3 py-2 text-sm font-medium hover:bg-ink/15 disabled:opacity-50"
                                disabled={!!actionBusy}
                                onClick={() =>
                                  void postAction(
                                    `${ordersUrl}/${encodeURIComponent(o.id)}/cancel`,
                                    `cancel-${o.id}`,
                                  )
                                }
                              >
                                Cancel order
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] px-3 py-2 text-sm font-medium hover:bg-ink/[0.04] disabled:opacity-50"
                                disabled={!!actionBusy}
                                onClick={() =>
                                  void postAction(
                                    `${ordersUrl}/${encodeURIComponent(o.id)}/unapprove`,
                                    `unapprove-${o.id}`,
                                  )
                                }
                              >
                                Un-approve
                              </button>
                              <button
                                type="button"
                                className="rounded-lg bg-[var(--highlight)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                disabled={!!actionBusy}
                                onClick={() => void postPlaceOrder(o.id)}
                              >
                                Place order
                              </button>
                            </>
                          ) : null}
                          {o.status === "order_placed" && isAdmin ? (
                            <button
                              type="button"
                              className="rounded-lg bg-ink/10 px-3 py-2 text-sm font-medium hover:bg-ink/15 disabled:opacity-50"
                              disabled={!!actionBusy}
                              onClick={() =>
                                void postAction(
                                  `${ordersUrl}/${encodeURIComponent(o.id)}/cancel`,
                                  `cancel-placed-${o.id}`,
                                )
                              }
                            >
                              Cancel order
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
