"use client";

import type { MarDayView } from "@/lib/mar/service";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    // ignore
  }
  return "Request failed.";
}

export function MarView({ homeId, homeName, initialDate, initialMar }: Props) {
  const [date, setDate] = useState(initialDate);
  const [mar, setMar] = useState<MarDayView>(initialMar);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/homes/${homeId}/mar?date=${encodeURIComponent(nextDate)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          setError(await parseError(res));
          return;
        }
        const json = (await res.json()) as { mar: MarDayView };
        setMar(json.mar);
        setDate(nextDate);
      } finally {
        setLoading(false);
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

  return (
    <main className="flex flex-col gap-5 text-ink">
      {/* Compact header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">Daily MAR</h1>
            <p className="text-xs text-[var(--text-secondary)]">{homeName}</p>
          </div>
        </div>
        <Link
          href={`/dashboard/homes/${homeId}/residents`}
          className="village-btn-secondary self-start text-xs"
        >
          Back to residents
        </Link>
      </div>

      {/* Date nav + progress — single compact bar */}
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
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--bg-muted)] sm:w-28">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${pctTotal}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-[var(--accent)]">
            {totalGiven}/{totalScheduled}
          </span>
        </div>
      </div>

      {error && <p className="village-alert-error">{error}</p>}
      {loading && (
        <p className="text-xs text-[var(--text-secondary)]">Loading MAR…</p>
      )}

      <div className="flex flex-col gap-4">
        {mar.slots.map((slotGroup) => (
          <SlotSection
            key={slotGroup.slot}
            homeId={homeId}
            date={date}
            slotGroup={slotGroup}
            onUpdated={() => void loadMar(date)}
          />
        ))}
        <PrnSection
          homeId={homeId}
          date={date}
          medications={mar.prnMedications}
          onUpdated={() => void loadMar(date)}
        />
      </div>
    </main>
  );
}
