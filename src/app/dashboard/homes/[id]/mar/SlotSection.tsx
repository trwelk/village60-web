"use client";

import type {
  MarAdministrationRecord,
  MarMedicationEntry,
  MarSlotGroup,
} from "@/lib/mar/service";
import { Check, RotateCcw, UserRound } from "lucide-react";
import { useState } from "react";

function formatAdminTime(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  homeId: string;
  date: string;
  slotGroup: MarSlotGroup;
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
    // ignore
  }
  return "Request failed.";
}

function groupByResident(medications: MarMedicationEntry[]) {
  const groups = new Map<
    string,
    { residentId: string; residentName: string; hasPortrait: boolean; meds: MarMedicationEntry[] }
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

function MedicationCard({
  homeId,
  date,
  slot,
  med,
  residentName,
  onUpdated,
}: {
  homeId: string;
  date: string;
  slot: string;
  med: MarMedicationEntry;
  residentName: string;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [administration, setAdministration] = useState<MarAdministrationRecord | null>(
    med.administration,
  );

  async function markGiven() {
    if (busy || administration) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/homes/${homeId}/mar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentMedicationId: med.residentMedicationId,
          slot,
          date,
        }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const json = (await res.json()) as { administration: MarAdministrationRecord };
      setAdministration(json.administration);
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (busy || !administration) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/homes/${homeId}/mar/${encodeURIComponent(administration.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setAdministration(null);
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  const doseLabel = `${med.quantityPerServing} ${med.unit}`;
  const isGiven = !!administration;

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-xl border p-3 transition-all duration-150 ${
        isGiven
          ? "border-success/30 bg-success/[0.06]"
          : "border-[var(--line-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--accent)]/40 hover:shadow-[0_2px_12px_-4px_rgba(106,61,232,0.12)]"
      }`}
      style={{ minHeight: "5.5rem" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8rem] font-semibold leading-tight text-[var(--text-primary)]">
            {med.itemName}
          </p>
          <p className="mt-0.5 text-[0.7rem] font-medium text-[var(--accent-strong)]">{doseLabel}</p>
        </div>
        {isGiven && (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </div>
        )}
      </div>

      {med.directions && (
        <p className="mt-1 line-clamp-1 text-[0.65rem] leading-snug text-[var(--text-muted)]">
          {med.directions}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-1">
        <span className="truncate text-[0.65rem] font-medium text-[var(--text-secondary)]">
          {residentName.split(" ")[0]}
        </span>

        {isGiven ? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--line-subtle)] px-2 text-[0.65rem] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-muted)]"
            onClick={() => void undo()}
            disabled={busy}
            aria-label={`Undo ${med.itemName}`}
          >
            <RotateCcw className="h-3 w-3" />
            Undo
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 text-[0.65rem] font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
            onClick={() => void markGiven()}
            disabled={busy}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
            {busy ? "..." : "Give"}
          </button>
        )}
      </div>

      {administration && (
        <p className="mt-1.5 text-[0.6rem] text-success">
          {formatAdminTime(administration.administeredAtUtcMs)} · {administration.administeredByDisplayName ?? "staff"}
        </p>
      )}
      {error && <p className="mt-1 text-[0.6rem] font-medium text-[var(--danger)]">{error}</p>}
    </div>
  );
}

function ResidentAvatar({
  homeId,
  residentId,
  hasPortrait,
}: {
  homeId: string;
  residentId: string;
  hasPortrait: boolean;
  name: string;
}) {
  if (hasPortrait) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/homes/${homeId}/residents/${residentId}/photo`}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-[var(--accent)]/15"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]"
    >
      <UserRound className="h-3.5 w-3.5" />
    </div>
  );
}

export function SlotSection({ homeId, date, slotGroup, onUpdated }: Props) {
  const residentGroups = groupByResident(slotGroup.medications);
  const pctDone =
    slotGroup.totalCount === 0
      ? 0
      : Math.round((slotGroup.administeredCount / slotGroup.totalCount) * 100);

  return (
    <section className="village-card overflow-hidden">
      {/* Slot header — compact */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line-subtle)]/60 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">{slotGroup.label}</h2>
          <span className="text-xs text-[var(--text-secondary)]">
            {slotGroup.administeredCount}/{slotGroup.totalCount}
          </span>
        </div>
        {slotGroup.totalCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--bg-muted)] sm:w-24">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${pctDone}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-[var(--accent)]">{pctDone}%</span>
          </div>
        )}
      </div>

      {/* Resident groups with grid of med cards */}
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {residentGroups.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No medications scheduled for this time slot.
          </p>
        ) : (
          residentGroups.map((group) => (
            <div key={group.residentId}>
              <div className="mb-2 flex items-center gap-2">
                <ResidentAvatar
                  homeId={homeId}
                  residentId={group.residentId}
                  hasPortrait={group.hasPortrait}
                  name={group.residentName}
                />
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {group.residentName}
                </span>
                <span className="text-[0.65rem] text-[var(--text-muted)]">
                  {group.meds.filter((m) => m.administration).length}/{group.meds.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {group.meds.map((med) => (
                  <MedicationCard
                    key={`${med.residentMedicationId}-${slotGroup.slot}`}
                    homeId={homeId}
                    date={date}
                    slot={slotGroup.slot}
                    med={med}
                    residentName={group.residentName}
                    onUpdated={onUpdated}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
