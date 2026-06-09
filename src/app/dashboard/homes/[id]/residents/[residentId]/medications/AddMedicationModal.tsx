"use client";

import { VillageSelect } from "@/components/VillageSelect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { INVOICE_MODAL_PRIMARY_BTN_CLASS as MODAL_PRIMARY_BTN_CLASS } from "@/app/dashboard/invoices/invoiceModalStyles";
import {
  defaultSlotsForServingsPerDay,
  MAR_SLOT_LABELS,
  MAR_TIME_SLOTS,
  type MarTimeSlot,
} from "@/lib/mar/constants";

const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

type CatalogItem = {
  id: string;
  name: string;
  baseUnit: string;
  categoryName: string;
};

type Props = {
  homeId: string;
  residentId: string;
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

function defaultFormState() {
  return {
    itemId: "",
    quantityPerServing: "1",
    directions: "",
    servingsPerDay: "",
    prn: false,
    scheduledSlots: ["morning", "afternoon", "evening", "night"] as MarTimeSlot[],
  };
}

export function AddMedicationModal({ homeId, residentId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultFormState);

  function toggleSlot(slot: MarTimeSlot) {
    setForm((current) => {
      const selected = current.scheduledSlots.includes(slot)
        ? current.scheduledSlots.filter((entry) => entry !== slot)
        : [...current.scheduledSlots, slot];
      return { ...current, scheduledSlots: selected };
    });
  }

  function syncSlotsFromServings(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      setForm((current) => ({
        ...current,
        servingsPerDay: raw,
        scheduledSlots: [...MAR_TIME_SLOTS],
      }));
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (Number.isInteger(n) && n >= 1) {
      setForm((current) => ({
        ...current,
        servingsPerDay: raw,
        scheduledSlots: defaultSlotsForServingsPerDay(n),
      }));
    } else {
      setForm((current) => ({ ...current, servingsPerDay: raw }));
    }
  }

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setError(null);
    setForm(defaultFormState());
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeModal]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingItems(true);
      setError(null);
      try {
        const res = await fetch(`/api/homes/${homeId}/inventory-items`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setError(await parseError(res));
          return;
        }
        const json = (await res.json()) as {
          items: Array<{
            id: string;
            name: string;
            baseUnit: string;
            categoryName: string;
          }>;
        };
        if (cancelled) return;
        setItems(json.items);
        setForm((f) => ({
          ...f,
          itemId:
            f.itemId && json.items.some((i) => i.id === f.itemId)
              ? f.itemId
              : (json.items[0]?.id ?? ""),
        }));
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeId, open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.itemId || submitting) return;
    const qty = Number(form.quantityPerServing);
    if (!Number.isFinite(qty)) {
      setError("Quantity per serving must be a number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        itemId: form.itemId,
        quantityPerServing: qty,
        directions: form.directions,
        prn: form.prn,
      };
      if (!form.prn) {
        if (form.scheduledSlots.length === 0) {
          setError("Select at least one time slot.");
          setSubmitting(false);
          return;
        }
        body.scheduledSlots = form.scheduledSlots;
      }
      const sp = form.servingsPerDay.trim();
      if (sp !== "") {
        const n = parseInt(sp, 10);
        if (!Number.isInteger(n) || n < 1) {
          setError("Servings per day must be a positive integer or left blank.");
          setSubmitting(false);
          return;
        }
        body.servingsPerDay = n;
      } else {
        body.servingsPerDay = null;
      }

      const res = await fetch(
        `/api/homes/${homeId}/residents/${residentId}/clinical/medications`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setForm(defaultFormState());
      closeModal();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
        onClick={openModal}
      >
        Add medication
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss add medication dialog"
                onClick={closeModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="medications-create-modal-heading"
                data-testid="medications-create-panel"
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
                              Resident medication
                            </p>
                            <h2
                              id="medications-create-modal-heading"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              Add medication
                            </h2>
                            <p className="text-sm leading-6 text-ink/65">
                              Choose a catalog item from this home, then set dose, directions, and
                              schedule.{" "}
                              <Link
                                href={`/dashboard/inventory-orders/catalog?homeId=${encodeURIComponent(homeId)}`}
                                className="font-semibold text-terracotta underline decoration-terracotta/35 underline-offset-4 hover:opacity-90"
                              >
                                Manage catalog
                              </Link>
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                          <div className="rounded-2xl border border-pine/10 bg-cream/72 px-4 py-3 text-sm text-ink/65 shadow-sm">
                            <span className="font-semibold text-pine-2">{items.length}</span> catalog
                            item
                            {items.length === 1 ? "" : "s"} in home
                          </div>
                          <button
                            type="button"
                            className={MODAL_CLOSE_BTN_CLASS}
                            onClick={closeModal}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                    <form
                      id="medications-create-form"
                      className="grid gap-5 p-5 sm:p-6"
                      onSubmit={onSubmit}
                    >
                      {loadingItems ? (
                        <p className="text-sm text-[var(--text-secondary)]">Loading catalog…</p>
                      ) : items.length === 0 ? (
                        <p className="text-sm text-ink/70">
                          No inventory items exist for this home yet. Add items in the catalog before
                          assigning medications.
                        </p>
                      ) : (
                        <label
                          htmlFor="medications-create-item"
                          className="flex max-w-2xl flex-col gap-2"
                        >
                          <span className="village-label">Catalog item</span>
                          <VillageSelect
                            id="medications-create-item"
                            value={form.itemId}
                            onChange={(itemId) => setForm((f) => ({ ...f, itemId }))}
                            options={items.map((i) => ({
                              value: i.id,
                              label: `${i.name} (${i.baseUnit}) · ${i.categoryName}`,
                            }))}
                          />
                        </label>
                      )}
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <label
                          htmlFor="medications-create-qty"
                          className="flex min-w-[10rem] flex-1 flex-col gap-2"
                        >
                          <span className="village-label">Quantity per serving</span>
                          <input
                            id="medications-create-qty"
                            className="village-input min-w-0"
                            value={form.quantityPerServing}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, quantityPerServing: e.target.value }))
                            }
                            required
                            inputMode="decimal"
                            autoComplete="off"
                          />
                        </label>
                        <label
                          htmlFor="medications-create-servings"
                          className="flex min-w-[10rem] flex-1 flex-col gap-2"
                        >
                          <span className="village-label">Servings per day (optional)</span>
                          <input
                            id="medications-create-servings"
                            className="village-input min-w-0"
                            placeholder="Blank for as directed / PRN"
                            value={form.servingsPerDay}
                            onChange={(e) => syncSlotsFromServings(e.target.value)}
                            inputMode="numeric"
                            autoComplete="off"
                          />
                        </label>
                      </div>
                      <label
                        htmlFor="medications-create-directions"
                        className="flex flex-col gap-2"
                      >
                        <span className="village-label">Directions</span>
                        <textarea
                          id="medications-create-directions"
                          className="village-input min-h-[5rem] min-w-0 resize-y py-2"
                          value={form.directions}
                          onChange={(e) => setForm((f) => ({ ...f, directions: e.target.value }))}
                          required
                          autoComplete="off"
                        />
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 text-sm text-ink">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-pine/30 text-pine focus:ring-pine/40"
                          checked={form.prn}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              prn: e.target.checked,
                              scheduledSlots: e.target.checked
                                ? []
                                : defaultSlotsForServingsPerDay(
                                    f.servingsPerDay.trim()
                                      ? Number.parseInt(f.servingsPerDay, 10)
                                      : null,
                                  ),
                            }))
                          }
                        />
                        <span>PRN (as needed)</span>
                      </label>
                      {!form.prn ? (
                        <fieldset className="flex flex-col gap-3">
                          <legend className="village-label">Time slots</legend>
                          <div className="flex flex-wrap gap-3">
                            {MAR_TIME_SLOTS.map((slot) => (
                              <label
                                key={slot}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-pine/15 px-3 py-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-pine/30 text-pine focus:ring-pine/40"
                                  checked={form.scheduledSlots.includes(slot)}
                                  onChange={() => toggleSlot(slot)}
                                />
                                <span>{MAR_SLOT_LABELS[slot]}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ) : null}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          form="medications-create-form"
                          type="submit"
                          className={MODAL_PRIMARY_BTN_CLASS}
                          disabled={
                            submitting || loadingItems || items.length === 0 || !form.itemId
                          }
                        >
                          {submitting ? "Saving…" : "Create"}
                        </button>
                        {error ? (
                          <p className="text-sm font-medium text-terracotta">{error}</p>
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
