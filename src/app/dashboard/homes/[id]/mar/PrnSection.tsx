"use client";

import type { MarAdministrationRecord, MarPrnMedication } from "@/lib/mar/service";
import { Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

function formatAdminTime(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  homeId: string;
  date: string;
  medications: MarPrnMedication[];
  onUpdated: () => void;
};

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

function groupPrnByResident(medications: MarPrnMedication[]) {
  const groups = new Map<
    string,
    {
      residentId: string;
      residentName: string;
      hasPortrait: boolean;
      meds: MarPrnMedication[];
    }
  >();
  for (const med of medications) {
    const existing = groups.get(med.residentId);
    if (existing) {
      existing.meds.push(med);
    } else {
      groups.set(med.residentId, {
        residentId: med.residentId,
        residentName: med.residentName,
        hasPortrait: med.hasPortrait,
        meds: [med],
      });
    }
  }
  return [...groups.values()];
}

/* ── Compact PRN medication row ──────────────────────────────── */

function PrnRow({
  homeId,
  date,
  med,
  onUpdated,
}: {
  homeId: string;
  date: string;
  med: MarPrnMedication;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [administrations, setAdministrations] = useState<MarAdministrationRecord[]>(
    med.administrationsToday,
  );

  useEffect(() => {
    setAdministrations(med.administrationsToday);
  }, [date, med.residentMedicationId, med.administrationsToday]);

  async function givePrn() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/homes/${homeId}/mar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentMedicationId: med.residentMedicationId,
          slot: "prn",
          date,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const json = (await res.json()) as { administration: MarAdministrationRecord };
      setAdministrations((prev) => [...prev, json.administration]);
      setNotes("");
      setShowNotes(false);
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  const doseLabel = `${med.quantityPerServing} ${med.unit}`;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-muted)]/30 transition-colors">
        {/* Medication + dose */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span
            className="truncate text-[0.8rem] font-semibold text-[var(--text-primary)]"
            title={med.directions ? `${med.itemName} — ${med.directions}` : med.itemName}
          >
            {med.itemName}
          </span>
          <span className="shrink-0 text-[0.7rem] font-medium text-[var(--accent-strong)]">
            {doseLabel}
          </span>
          {med.directions && (
            <span
              className="hidden max-w-[12rem] shrink truncate text-[0.65rem] text-[var(--text-muted)] md:block"
              title={med.directions}
            >
              {med.directions}
            </span>
          )}
        </div>

        {/* Today's administrations */}
        {administrations.length > 0 && (
          <div className="hidden shrink-0 gap-1 sm:flex">
            {administrations.map((admin) => (
              <span
                key={admin.id}
                className="inline-flex items-center rounded-md bg-success/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-success"
                title={admin.administeredByDisplayName ?? "staff"}
              >
                {formatAdminTime(admin.administeredAtUtcMs)}
              </span>
            ))}
          </div>
        )}

        {/* Give PRN button */}
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[var(--accent-strong)]/30 px-2 text-[0.7rem] font-bold text-[var(--accent-strong)] transition hover:bg-[var(--accent-strong)]/5"
          onClick={() => setShowNotes(!showNotes)}
          disabled={busy}
        >
          <Plus className="h-3 w-3" />
          Give
        </button>
      </div>

      {/* Inline notes form */}
      {showNotes && (
        <div className="flex items-center gap-2 border-t border-[var(--line-subtle)]/30 bg-[var(--bg-muted)]/20 px-4 py-2 pl-8">
          <input
            type="text"
            className="h-7 min-w-0 flex-1 rounded-lg border border-[var(--line-subtle)] bg-[var(--bg-canvas)] px-2 text-[0.75rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void givePrn();
              if (e.key === "Escape") setShowNotes(false);
            }}
            autoFocus
          />
          <button
            type="button"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-[var(--accent-strong)] px-3 text-[0.7rem] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            onClick={() => void givePrn()}
            disabled={busy}
          >
            {busy ? "…" : "Confirm"}
          </button>
          <button
            type="button"
            className="shrink-0 text-[0.7rem] font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
            onClick={() => {
              setShowNotes(false);
              setNotes("");
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p className="px-4 pb-1.5 text-[0.6rem] font-medium text-[var(--danger)]">{error}</p>
      )}
    </div>
  );
}

/* ── Resident avatar (inline) ────────────────────────────────── */

function PrnResidentAvatar({
  homeId,
  residentId,
  hasPortrait,
}: {
  homeId: string;
  residentId: string;
  hasPortrait: boolean;
}) {
  if (hasPortrait) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/homes/${homeId}/residents/${residentId}/photo`}
        alt=""
        className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-[var(--accent)]/15"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]"
    >
      <UserRound className="h-3 w-3" />
    </div>
  );
}

/* ── PRN section (tab content) ───────────────────────────────── */

export function PrnSection({ homeId, date, medications, onUpdated }: Props) {
  const residentGroups = groupPrnByResident(medications);

  if (residentGroups.length === 0) {
    return (
      <div className="village-card flex items-center justify-center py-10 text-sm text-[var(--text-secondary)]">
        No PRN medications assigned to active residents.
      </div>
    );
  }

  return (
    <div className="village-card overflow-hidden">
      {residentGroups.map((group, gi) => (
        <div
          key={group.residentId}
          className={gi > 0 ? "border-t border-[var(--line-subtle)]" : ""}
        >
          {/* Resident header */}
          <div className="flex items-center gap-2 bg-[var(--bg-muted)]/25 px-4 py-2">
            <PrnResidentAvatar
              homeId={homeId}
              residentId={group.residentId}
              hasPortrait={group.hasPortrait}
            />
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {group.residentName}
            </span>
            <span className="text-[0.65rem] text-[var(--text-muted)]">
              {group.meds.length} {group.meds.length === 1 ? "medication" : "medications"}
            </span>
          </div>

          {/* PRN medication rows */}
          {group.meds.map((med, mi) => (
            <div
              key={med.residentMedicationId}
              className={mi > 0 ? "border-t border-[var(--line-subtle)]/40" : ""}
            >
              <PrnRow
                key={`${date}-${med.residentMedicationId}`}
                homeId={homeId}
                date={date}
                med={med}
                onUpdated={onUpdated}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
