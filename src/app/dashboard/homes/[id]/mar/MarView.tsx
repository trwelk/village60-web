"use client";

import type { MarDayView } from "@/lib/mar/service";
import {
  ChevronLeft,
  ChevronRight,
  Moon,
  Pill,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dashboardResidentsHref } from "@/lib/dashboard/dashboardRoutes";
import { PrnSection } from "./PrnSection";
import { SlotSection } from "./SlotSection";

type Props = {
  homeId: string;
  homeName: string;
  initialDate: string;
  initialMar: MarDayView;
};

function shiftIsoDate(date: string, deltaDays: number): string {
  const [y, m, d] = date.split("-").map((part) => Number.parseInt(part, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, "0");
  const nd = String(dt.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string") return err;
    }
  } catch {
    /* ignore */
  }
  return "Request failed.";
}

const SLOT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
};

export function MarView({ homeId, homeName, initialDate, initialMar }: Props) {
  const [date, setDate] = useState(initialDate);
  const [mar, setMar] = useState<MarDayView>(initialMar);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<string>(() => {
    const pending = initialMar.slots.find(
      (s) => s.totalCount > 0 && s.administeredCount < s.totalCount,
    );
    return pending?.slot ?? initialMar.slots[0]?.slot ?? "morning";
  });
  const loadSeqRef = useRef(0);

  const totalScheduled = useMemo(
    () => mar.slots.reduce((sum, slot) => sum + slot.totalCount, 0),
    [mar.slots],
  );
  const totalGiven = useMemo(
    () => mar.slots.reduce((sum, slot) => sum + slot.administeredCount, 0),
    [mar.slots],
  );

  const loadMar = useCallback(
    async (nextDate: string) => {
      const seq = ++loadSeqRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/homes/${homeId}/mar?date=${encodeURIComponent(nextDate)}`,
          { cache: "no-store" },
        );
        if (seq !== loadSeqRef.current) return;
        if (!res.ok) {
          setError(await parseError(res));
          return;
        }
        const json = (await res.json()) as { mar: MarDayView };
        if (seq !== loadSeqRef.current) return;
        setMar(json.mar);
        setDate(nextDate);
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [homeId],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("date") !== date) {
      params.set("date", date);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }
  }, [date]);

  const pctTotal =
    totalScheduled === 0 ? 0 : Math.round((totalGiven / totalScheduled) * 100);
  const showPrn = activeSlot === "prn";
  const activeSlotGroup = mar.slots.find((s) => s.slot === activeSlot);

  return (
    <main className="flex flex-col gap-4 text-ink">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Daily MAR</h1>
          <p className="text-xs text-[var(--text-secondary)]">{homeName}</p>
        </div>
        <Link
          href={dashboardResidentsHref(homeId)}
          className="village-btn-secondary self-start text-xs"
        >
          Back to residents
        </Link>
      </div>

      {/* Date nav + overall progress */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-subtle)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-muted)]"
            aria-label="Previous day"
            onClick={() => void loadMar(shiftIsoDate(date, -1))}
            disabled={loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            className="h-8 rounded-lg border border-[var(--line-subtle)] bg-[var(--bg-canvas)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            value={date}
            onChange={(e) => {
              if (e.target.value) void loadMar(e.target.value);
            }}
            disabled={loading}
          />
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-subtle)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-muted)]"
            aria-label="Next day"
            onClick={() => void loadMar(shiftIsoDate(date, 1))}
            disabled={loading}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {date !== todayIsoDate() && (
            <button
              type="button"
              className="h-8 rounded-lg border border-[var(--line-subtle)] px-2.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-muted)]"
              onClick={() => void loadMar(todayIsoDate())}
              disabled={loading}
            >
              Today
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-[var(--text-primary)]">
            {totalGiven}/{totalScheduled}
          </span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--bg-muted)] sm:w-28">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${pctTotal}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-[var(--accent)]">{pctTotal}%</span>
        </div>
      </div>

      {/* Slot tabs */}
      <nav className="village-tablist" role="tablist">
          {mar.slots.map((slot) => {
            const Icon = SLOT_ICONS[slot.slot];
            const isActive = slot.slot === activeSlot;
            const allDone = slot.totalCount > 0 && slot.administeredCount === slot.totalCount;
            return (
              <button
                key={slot.slot}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`village-tab inline-flex cursor-pointer items-center gap-1.5 ${isActive ? "village-tab-active" : ""}`}
                onClick={() => setActiveSlot(slot.slot)}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{slot.label}</span>
                <span className={`text-[0.65rem] ${allDone ? "text-success font-bold" : ""}`}>
                  {slot.administeredCount}/{slot.totalCount}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            role="tab"
            aria-selected={showPrn}
            className={`village-tab inline-flex cursor-pointer items-center gap-1.5 ${showPrn ? "village-tab-active" : ""}`}
            onClick={() => setActiveSlot("prn")}
          >
            <Pill className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">PRN</span>
            <span className="text-[0.65rem]">{mar.prnMedications.length}</span>
          </button>
      </nav>

      {error && <p className="village-alert-error">{error}</p>}
      {loading && <p className="text-xs text-[var(--text-secondary)]">Loading MAR…</p>}

      {/* Active tab content */}
      <div role="tabpanel">
        {showPrn ? (
          <PrnSection
            key={date}
            homeId={homeId}
            date={date}
            medications={mar.prnMedications}
            onUpdated={() => void loadMar(date)}
          />
        ) : activeSlotGroup ? (
          <SlotSection
            key={date}
            homeId={homeId}
            date={date}
            slotGroup={activeSlotGroup}
            onUpdated={() => void loadMar(date)}
          />
        ) : null}
      </div>
    </main>
  );
}
