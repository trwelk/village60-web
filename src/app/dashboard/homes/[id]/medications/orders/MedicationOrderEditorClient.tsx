"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ResidentOption = { id: string; fullName: string };
type MedicationOption = {
  residentMedicationId: string;
  medicationId: string;
  name: string;
  strength: string;
  unit: string;
  suggestedOrderedQty: number;
};
type LineDetail = {
  id: string;
  residentMedicationId: string;
  orderedQty: number;
  orderUnitLabel: string | null;
  name: string;
  strength: string;
  unit: string;
};
type OrderDetail = {
  order: { id: string; residentId: string; status: string };
  lines: LineDetail[];
};

type Props = {
  homeId: string;
  homeLabel: string;
  initialOrderId?: string;
  initialResidentId?: string;
};

export function MedicationOrderEditorClient({
  homeId,
  homeLabel,
  initialOrderId,
  initialResidentId,
}: Props) {
  const router = useRouter();
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [residentId, setResidentId] = useState(initialResidentId ?? "");
  const [residents, setResidents] = useState<ResidentOption[]>([]);
  const [medications, setMedications] = useState<MedicationOption[]>([]);
  const [selectedResidentMedicationId, setSelectedResidentMedicationId] = useState("");
  const [newLineQty, setNewLineQty] = useState("1");
  const [lineQtyDraft, setLineQtyDraft] = useState<Record<string, string>>({});
  const [newLineOrderUnitLabel, setNewLineOrderUnitLabel] = useState("");
  const [lineOrderUnitDraft, setLineOrderUnitDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const orderId = orderDetail?.order.id ?? initialOrderId;
  const isEditable = orderDetail
    ? orderDetail.order.status === "pending" || orderDetail.order.status === "approved"
    : true;
  const selectedMed = medications.find((m) => m.residentMedicationId === selectedResidentMedicationId);
  const availableMeds = useMemo(() => {
    const existing = new Set(orderDetail?.lines.map((l) => l.residentMedicationId) ?? []);
    return medications.filter((m) => !existing.has(m.residentMedicationId));
  }, [medications, orderDetail?.lines]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/residents?status=active&pageSize=500`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { residents: ResidentOption[] };
      setResidents(body.residents);
    })();
  }, [homeId]);

  useEffect(() => {
    if (!initialOrderId) return;
    void (async () => {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/medications/orders/${encodeURIComponent(initialOrderId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as OrderDetail;
      setOrderDetail(body);
      setResidentId(body.order.residentId);
      const draft: Record<string, string> = {};
      const unitDraft: Record<string, string> = {};
      for (const ln of body.lines) draft[ln.id] = String(ln.orderedQty);
      for (const ln of body.lines) unitDraft[ln.id] = ln.orderUnitLabel ?? "";
      setLineQtyDraft(draft);
      setLineOrderUnitDraft(unitDraft);
    })();
  }, [homeId, initialOrderId]);

  useEffect(() => {
    if (!residentId) {
      setMedications([]);
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/medications/orders/resident-medications?residentId=${encodeURIComponent(residentId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { medications: MedicationOption[] };
      setMedications(body.medications);
      if (!selectedResidentMedicationId && body.medications.length > 0) {
        setSelectedResidentMedicationId(body.medications[0]!.residentMedicationId);
        setNewLineQty(String(body.medications[0]!.suggestedOrderedQty));
      }
    })();
  }, [homeId, residentId, selectedResidentMedicationId]);

  useEffect(() => {
    if (!selectedMed) return;
    setNewLineQty(String(selectedMed.suggestedOrderedQty));
  }, [selectedMed?.residentMedicationId]);

  async function addLine() {
    const qty = Number.parseInt(newLineQty, 10);
    if (!residentId || !selectedResidentMedicationId || Number.isNaN(qty) || qty < 1) {
      setError("Select resident/medication and use a valid quantity.");
      return;
    }
    setBusyKey("add-line");
    setError(null);
    try {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/medications/orders/lines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            residentId,
            residentMedicationId: selectedResidentMedicationId,
            orderedQty: qty,
            orderUnitLabel: newLineOrderUnitLabel.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to add line.");
      }
      const detail = (await res.json()) as OrderDetail;
      setOrderDetail(detail);
      setLineQtyDraft((d) => {
        const next = { ...d };
        for (const ln of detail.lines) next[ln.id] = String(ln.orderedQty);
        return next;
      });
      setLineOrderUnitDraft((d) => {
        const next = { ...d };
        for (const ln of detail.lines) next[ln.id] = ln.orderUnitLabel ?? "";
        return next;
      });
      setNewLineOrderUnitLabel("");
      router.replace(
        `/dashboard/homes/${encodeURIComponent(homeId)}/medications/orders/${encodeURIComponent(detail.order.id)}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add line.");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveLine(lineId: string) {
    if (!orderId) return;
    const qty = Number.parseInt(lineQtyDraft[lineId] ?? "", 10);
    if (Number.isNaN(qty) || qty < 1) {
      setError("Line quantity must be a positive integer.");
      return;
    }
    setBusyKey(`save-${lineId}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/medications/orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(lineId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedQty: qty,
            orderUnitLabel: (lineOrderUnitDraft[lineId] ?? "").trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to save line.");
      }
      const detail = (await res.json()) as OrderDetail;
      setOrderDetail(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save line.");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeLine(lineId: string) {
    if (!orderId) return;
    setBusyKey(`remove-${lineId}`);
    setError(null);
    try {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/medications/orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(lineId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to remove line.");
      }
      const detail = (await res.json()) as OrderDetail;
      setOrderDetail(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove line.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="flex flex-col gap-6 text-[var(--text-primary)]">
      <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-5">
        <h1 className="text-2xl font-semibold">Medication order editor</h1>
        <p className="mt-2 text-sm text-ink/70">{homeLabel}</p>
        <p className="mt-2 text-sm">
          <Link
            href={`/dashboard/homes/${encodeURIComponent(homeId)}/medications/orders`}
            className="text-[var(--highlight)] underline"
          >
            Back to orders
          </Link>
        </p>
      </div>

      <section className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-5">
        <h2 className="text-lg font-semibold">Add line</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Resident
            <select
              className="mt-1 w-full rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[var(--bg-page)] px-2 py-2"
              value={residentId}
              onChange={(e) => setResidentId(e.target.value)}
              disabled={!!orderId}
            >
              <option value="">Select…</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Medication
            <select
              className="mt-1 w-full rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[var(--bg-page)] px-2 py-2"
              value={selectedResidentMedicationId}
              onChange={(e) => setSelectedResidentMedicationId(e.target.value)}
              disabled={!residentId || !isEditable}
            >
              {availableMeds.length === 0 ? (
                <option value="">No medications available</option>
              ) : (
                availableMeds.map((m) => (
                  <option key={m.residentMedicationId} value={m.residentMedicationId}>
                    {m.name} {m.strength} {m.unit}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="text-sm">
            Ordered qty
            <input
              type="number"
              min={1}
              step={1}
              className="mt-1 w-full rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[var(--bg-page)] px-2 py-2"
              value={newLineQty}
              onChange={(e) => setNewLineQty(e.target.value)}
              disabled={!isEditable}
            />
          </label>
          <label className="text-sm">
            Order unit
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[var(--bg-page)] px-2 py-2"
              value={newLineOrderUnitLabel}
              onChange={(e) => setNewLineOrderUnitLabel(e.target.value)}
              disabled={!isEditable}
              placeholder="bottle / box"
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busyKey === "add-line" || !isEditable || !residentId || availableMeds.length === 0}
          onClick={() => void addLine()}
        >
          {busyKey === "add-line" ? "Adding…" : "Add line"}
        </button>
      </section>

      <section className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-5">
        <h2 className="text-lg font-semibold">Lines</h2>
        {orderDetail ? (
          <>
            <p className="mt-1 text-sm text-ink/70">
              Order status: <span className="font-medium">{orderDetail.order.status}</span>
            </p>
            {orderDetail.lines.length === 0 ? (
              <p className="mt-3 text-sm text-ink/70">No lines yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {orderDetail.lines.map((ln) => (
                  <li
                    key={ln.id}
                    className="flex flex-wrap items-end gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_40%,transparent)] p-3"
                  >
                    <span className="min-w-[220px] flex-1 text-sm font-medium">
                      {ln.name} {ln.strength} {ln.unit}
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="w-24 rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[var(--bg-page)] px-2 py-1.5 text-sm"
                      value={lineQtyDraft[ln.id] ?? String(ln.orderedQty)}
                      disabled={!isEditable}
                      onChange={(e) =>
                        setLineQtyDraft((d) => ({ ...d, [ln.id]: e.target.value }))
                      }
                    />
                    <input
                      type="text"
                      className="w-36 rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[var(--bg-page)] px-2 py-1.5 text-sm"
                      value={lineOrderUnitDraft[ln.id] ?? ln.orderUnitLabel ?? ""}
                      disabled={!isEditable}
                      onChange={(e) =>
                        setLineOrderUnitDraft((d) => ({ ...d, [ln.id]: e.target.value }))
                      }
                      placeholder="order unit"
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      onClick={() => void saveLine(ln.id)}
                      disabled={!isEditable || busyKey === `save-${ln.id}`}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50 dark:text-red-300"
                      onClick={() => void removeLine(ln.id)}
                      disabled={!isEditable || busyKey === `remove-${ln.id}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-ink/70">
            Add the first line to create the order record.
          </p>
        )}
        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
