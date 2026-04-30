"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { calculateAge } from "@/lib/residents/age";
import type { Resident, ResidentWithoutFee } from "@/lib/residents/service";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DepartResidentModal } from "./DepartResidentModal";

type WardOption = { id: string; label: string };

type Props = {
  homeId: string;
  resident: Resident | ResidentWithoutFee;
  wards: WardOption[];
};

function StatusBadge({ status }: { status: "active" | "departed" }) {
  return (
    <span
      data-testid="status-badge"
      className={
        status === "active"
          ? "inline-flex items-center rounded-full bg-success-muted px-2.5 py-0.5 text-xs font-semibold tracking-wide text-success"
          : "inline-flex items-center rounded-full bg-cream-muted px-2.5 py-0.5 text-xs font-semibold text-ink/70 ring-1 ring-pine/15"
      }
    >
      {status === "active" ? "Active" : "Departed"}
    </span>
  );
}

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
  } catch {
    /* ignore */
  }
  return "Request failed.";
}

export function ResidentHeader({ homeId, resident, wards }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [departOpen, setDepartOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(resident.fullName);
  const [dob, setDob] = useState(resident.dob);
  const [admissionDate, setAdmissionDate] = useState(resident.admissionDate);
  const [wardId, setWardId] = useState(resident.wardId ?? "");
  const [roomText, setRoomText] = useState(resident.roomText ?? "");

  const isDeparted = resident.status === "departed";
  const today = new Date().toISOString().slice(0, 10);
  const age = calculateAge(resident.dob, today);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(`/api/homes/${homeId}/residents/${resident.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        dob,
        admissionDate,
        wardId: isDeparted ? null : wardId || null,
        roomText: isDeparted ? null : roomText || null,
      }),
    });

    if (!res.ok) {
      setError(await parseError(res));
      return;
    }

    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <>
        <div className="village-card flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <h1 className="font-display text-3xl font-normal tracking-tight text-pine-2">
                {resident.fullName}
              </h1>
              <StatusBadge status={resident.status as "active" | "departed"} />
            </div>
            <div
              className="mt-4 flex flex-wrap items-baseline gap-x-1 gap-y-2 border-t border-pine/12 pt-4 text-sm"
              role="group"
              aria-label="Demographics"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="village-field-label">DOB</span>
                <span className="font-medium text-ink">
                  {resident.dob}{" "}
                  <span className="text-ink/60">(age {age})</span>
                </span>
              </div>
              <span className="mx-1 text-ink/25 select-none" aria-hidden>
                ·
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="village-field-label">Admitted</span>
                <span className="font-medium text-ink">
                  {resident.admissionDate}
                </span>
              </div>
              {wards.find((w) => w.id === resident.wardId) ? (
                <>
                  <span className="mx-1 text-ink/25 select-none" aria-hidden>
                    ·
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="village-field-label">Ward</span>
                    <span className="font-medium text-ink">
                      {wards.find((w) => w.id === resident.wardId)?.label}
                    </span>
                  </div>
                </>
              ) : null}
              {resident.roomText ? (
                <>
                  <span className="mx-1 text-ink/25 select-none" aria-hidden>
                    ·
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="village-field-label">Room</span>
                    <span className="font-medium text-ink">
                      {resident.roomText}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 self-start">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="village-btn-secondary"
            >
              Edit
            </button>
            {!isDeparted ? (
              <button
                type="button"
                onClick={() => setDepartOpen(true)}
                className="rounded-lg border border-danger/35 bg-cream px-4 py-2 text-sm font-semibold text-danger shadow-sm transition hover:bg-danger/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/35"
              >
                Depart
              </button>
            ) : null}
          </div>
        </div>
        <DepartResidentModal
          open={departOpen}
          onClose={() => setDepartOpen(false)}
          homeId={homeId}
          residentId={resident.id}
          onDeparted={() => router.refresh()}
        />
      </>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="village-card flex flex-col gap-4 p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="village-section-title text-lg">Edit core fields</h2>
        <StatusBadge status={resident.status as "active" | "departed"} />
      </div>

      {error ? <p className="village-alert-error">{error}</p> : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="village-field-label">Full name</span>
        <input
          className="village-input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="village-field-label">Date of birth</span>
        <input
          type="date"
          className="village-input"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="village-field-label">Admission date</span>
        <input
          type="date"
          className="village-input"
          value={admissionDate}
          onChange={(e) => setAdmissionDate(e.target.value)}
          required
        />
      </label>

      {isDeparted ? (
        <p className="text-sm text-ink/70">
          Ward and room were cleared at departure; placement cannot be edited
          here.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 text-sm">
            <label
              className="village-field-label"
              htmlFor="resident-header-ward"
            >
              Ward (optional)
            </label>
            <VillageSelect
              id="resident-header-ward"
              value={wardId}
              onChange={setWardId}
              options={[
                { value: "", label: "—" },
                ...wards.map((w) => ({ value: w.id, label: w.label })),
              ]}
            />
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="village-field-label">Room / bed (optional)</span>
            <input
              className="village-input"
              value={roomText}
              onChange={(e) => setRoomText(e.target.value)}
              autoComplete="off"
            />
          </label>
        </>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        <button type="submit" className="village-btn-primary">
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="village-btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
