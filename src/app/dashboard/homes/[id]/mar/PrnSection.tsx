"use client";

import type { MarAdministrationRecord, MarPrnMedication } from "@/lib/mar/service";
import { Plus, UserRound } from "lucide-react";
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
    // ignore
  }
  return "Request failed.";
}

function PrnCard({
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
    <div className="flex flex-col justify-between rounded-xl border border-[var(--line-subtle)] bg-[var(--bg-elevated)] p-3 transition-all hover:border-[var(--accent-strong)]/40 hover:shadow-[0_2px_12px_-4px_rgba(106,61,232,0.10)]">
      <div className="flex items-start gap-2">
        {med.hasPortrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/homes/${homeId}/residents/${med.residentId}/photo`}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-[var(--accent)]/15"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]"
          >
            <UserRound className="h-3 w-3" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.7rem] font-semibold text-[var(--text-primary)]">
            {med.residentName}
          </p>
          <p className="truncate text-[0.7rem] font-medium text-[var(--text-secondary)]">
            {med.itemName}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-[var(--accent-strong)]/10 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-[var(--accent-strong)]">
          PRN
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[0.65rem] font-medium text-[var(--accent-strong)]">{doseLabel}</span>
        {med.directions && (
          <span className="line-clamp-1 text-[0.6rem] text-[var(--text-muted)]">{med.directions}</span>
        )}
      </div>

      {administrations.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {administrations.map((admin) => (
            <span
              key={admin.id}
              className="inline-flex items-center rounded-md bg-success/10 px-1.5 py-0.5 text-[0.58rem] text-success"
            >
              {formatAdminTime(admin.administeredAtUtcMs)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2">
        {showNotes ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              className="w-full resize-none rounded-lg border border-[var(--line-subtle)] bg-[var(--bg-canvas)] px-2 py-1.5 text-[0.7rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              placeholder="Optional notes..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-md bg-[var(--accent-strong)] text-[0.65rem] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                onClick={() => void givePrn()}
                disabled={busy}
              >
                {busy ? "..." : "Confirm"}
              </button>
              <button
                type="button"
                className="inline-flex h-6 items-center justify-center rounded-md border border-[var(--line-subtle)] px-2 text-[0.65rem] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
                onClick={() => setShowNotes(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-[var(--accent-strong)]/30 text-[0.65rem] font-bold text-[var(--accent-strong)] transition hover:bg-[var(--accent-strong)]/5 disabled:opacity-50"
            onClick={() => setShowNotes(true)}
            disabled={busy}
          >
            <Plus className="h-3 w-3" />
            Give PRN
          </button>
        )}
      </div>

      {error && <p className="mt-1 text-[0.6rem] font-medium text-[var(--danger)]">{error}</p>}
    </div>
  );
}

export function PrnSection({ homeId, date, medications, onUpdated }: Props) {
  return (
    <section className="village-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--line-subtle)]/60 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">PRN (as needed)</h2>
          <span className="text-xs text-[var(--text-secondary)]">{medications.length} medications</span>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        {medications.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No PRN medications are assigned to active residents.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {medications.map((med) => (
              <PrnCard
                key={med.residentMedicationId}
                homeId={homeId}
                date={date}
                med={med}
                onUpdated={onUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
