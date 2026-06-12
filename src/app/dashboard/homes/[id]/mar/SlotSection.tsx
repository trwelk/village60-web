"use client";

import type {
  MarAdministrationRecord,
  MarMedicationEntry,
  MarSlotGroup,
} from "@/lib/mar/service";
import { Check, CircleCheck, RotateCcw, UserRound } from "lucide-react";
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
  slotGroup: MarSlotGroup;
  onUpdated: () => void;
  hideDone?: boolean;
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

function groupByResident(medications: MarMedicationEntry[]) {
  const groups = new Map<
    string,
    {
      residentId: string;
      residentName: string;
      hasPortrait: boolean;
      meds: MarMedicationEntry[];
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

/* ── Medication tile (grid cell) ────────────────────────────────── */

function MedicationTile({
  homeId,
  date,
  slot,
  med,
  onUpdated,
}: {
  homeId: string;
  date: string;
  slot: string;
  med: MarMedicationEntry;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [administration, setAdministration] = useState<MarAdministrationRecord | null>(
    med.administration,
  );

  useEffect(() => {
    setAdministration(med.administration);
  }, [date, med.residentMedicationId, med.administration]);

  async function markGiven() {
    if (busy || administration) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/homes/${homeId}/mar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentMedicationId: med.residentMedicationId, slot, date }),
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

  const isGiven = !!administration;
  const doseLabel = `${med.quantityPerServing} ${med.unit}`;

  return (
    <div className={`mar-tile ${isGiven ? "mar-tile--given" : "mar-tile--pending"}`}>
      {/* Drug name + dose */}
      <div>
        <p
          className="mar-tile__name line-clamp-2"
          title={med.directions ? `${med.itemName} — ${med.directions}` : med.itemName}
        >
          {med.itemName}
        </p>
        <span className="mar-tile__dose">{doseLabel}</span>
      </div>

      {med.directions && (
        <p className="mar-tile__directions line-clamp-2" title={med.directions}>
          {med.directions}
        </p>
      )}

      {/* Action area */}
      <div className="mar-tile__footer">
        {isGiven ? (
          <>
            <span className="mar-tile__given-time">
              <CircleCheck className="h-3.5 w-3.5" />
              {formatAdminTime(administration.administeredAtUtcMs)}
            </span>
            <button
              type="button"
              className="mar-tile__undo"
              onClick={() => void undo()}
              disabled={busy}
              aria-label={`Undo ${med.itemName}`}
            >
              <RotateCcw className="h-3 w-3" />
              Undo
            </button>
          </>
        ) : (
          <button
            type="button"
            className="mar-tile__give"
            onClick={() => void markGiven()}
            disabled={busy}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            {busy ? "Saving…" : "Give"}
          </button>
        )}
      </div>

      {error && <p className="mar-tile__error">{error}</p>}
    </div>
  );
}

/* ── Resident avatar ─────────────────────────────────────────── */

function ResidentAvatar({
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

/* ── Slot section (one tab's content) ────────────────────────── */

export function SlotSection({ homeId, date, slotGroup, onUpdated, hideDone = false }: Props) {
  const residentGroups = groupByResident(slotGroup.medications);

  const displayData = residentGroups
    .map((g) => {
      const originalTotal = g.meds.length;
      const originalGiven = g.meds.filter((m) => m.administration).length;
      const displayMeds = hideDone ? g.meds.filter((m) => !m.administration) : g.meds;
      return { ...g, displayMeds, originalTotal, originalGiven };
    })
    .filter((g) => g.displayMeds.length > 0);

  if (displayData.length === 0) {
    return (
      <div className="village-card flex items-center justify-center py-10 text-sm text-[var(--text-secondary)]">
        {hideDone
          ? "All medications in this slot have been administered."
          : "No medications scheduled for this time slot."}
      </div>
    );
  }

  return (
    <div className="village-card overflow-hidden">
      {displayData.map((group) => {
        const allDone =
          group.originalGiven === group.originalTotal && group.originalTotal > 0;

        return (
          <div key={group.residentId} className="mar-resident-group">
            <div className="mar-resident-header">
              <ResidentAvatar
                homeId={homeId}
                residentId={group.residentId}
                hasPortrait={group.hasPortrait}
              />
              <span className="mar-resident-header__name">
                {group.residentName}
              </span>
              <span
                className={`mar-resident-header__progress ${
                  allDone
                    ? "mar-resident-header__progress--done"
                    : "mar-resident-header__progress--pending"
                }`}
              >
                {group.originalGiven}/{group.originalTotal}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.displayMeds.map((med) => (
                <MedicationTile
                  key={`${date}-${med.residentMedicationId}-${slotGroup.slot}`}
                  homeId={homeId}
                  date={date}
                  slot={slotGroup.slot}
                  med={med}
                  onUpdated={onUpdated}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
