"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { calculateAge } from "@/lib/residents/age";
import type { ResidentPublic } from "@/lib/residents/service";
import type { SessionUserRole } from "@/lib/session";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DepartResidentModal } from "./DepartResidentModal";

type WardOption = { id: string; label: string };

type Props = {
  homeId: string;
  resident: ResidentPublic;
  wards: WardOption[];
  userRole: SessionUserRole;
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

function residentPortraitSrc(
  homeId: string,
  residentId: string,
  hasPortrait: boolean,
  portraitUpdatedAtUtcMs: number | null,
): string | null {
  if (!hasPortrait) return null;
  const base = `/api/homes/${homeId}/residents/${residentId}/photo`;
  if (portraitUpdatedAtUtcMs != null) {
    return `${base}?v=${portraitUpdatedAtUtcMs}`;
  }
  return base;
}

function residentInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  const one = parts[0] ?? "";
  return one.slice(0, 2).toUpperCase();
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

export function ResidentHeader({ homeId, resident, wards, userRole }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [departOpen, setDepartOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [portraitBusy, setPortraitBusy] = useState(false);

  const [fullName, setFullName] = useState(resident.fullName);
  const [dob, setDob] = useState(resident.dob);
  const [admissionDate, setAdmissionDate] = useState(resident.admissionDate);
  const [wardId, setWardId] = useState(resident.wardId ?? "");
  const [roomText, setRoomText] = useState(resident.roomText ?? "");

  const isDeparted = resident.status === "departed";
  const today = new Date().toISOString().slice(0, 10);
  const age = calculateAge(resident.dob, today);

  const portraitSrc = residentPortraitSrc(
    homeId,
    resident.id,
    resident.hasPortrait,
    resident.portraitUpdatedAtUtcMs ?? null,
  );
  const portraitAlt = `Portrait of ${resident.fullName}`;

  async function handlePortraitFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setPortraitError(null);
    setPortraitBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(
        `/api/homes/${homeId}/residents/${resident.id}/photo`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        setPortraitError(await parseError(res));
        return;
      }
      router.refresh();
    } finally {
      setPortraitBusy(false);
      input.value = "";
    }
  }

  async function handleRemovePortrait() {
    if (
      !window.confirm(
        "Remove this resident's portrait? This cannot be undone from here.",
      )
    ) {
      return;
    }
    setPortraitError(null);
    setPortraitBusy(true);
    try {
      const res = await fetch(
        `/api/homes/${homeId}/residents/${resident.id}/photo`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setPortraitError(await parseError(res));
        return;
      }
      router.refresh();
    } finally {
      setPortraitBusy(false);
    }
  }

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
          <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="shrink-0">
              {portraitSrc ? (
                <img
                  src={portraitSrc}
                  alt={portraitAlt}
                  className="h-20 w-20 rounded-2xl object-cover ring-1 ring-pine/15"
                  width={80}
                  height={80}
                />
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-2xl bg-pine/8 text-pine-2 ring-1 ring-pine/15"
                  aria-label="No portrait"
                >
                  <span className="text-lg font-semibold text-ink/45" aria-hidden>
                    {residentInitials(resident.fullName)}
                  </span>
                </div>
              )}
            </div>
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
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 self-start">
            {!isDeparted ? (
              <Link
                href={`/dashboard/homes/${homeId}/residents/${resident.id}/medications`}
                className="village-btn-primary"
              >
                Medications
              </Link>
            ) : null}
            {userRole === "admin" ? (
              <>
                <Link
                  href={`/dashboard/homes/${homeId}/invoices?residentId=${encodeURIComponent(resident.id)}`}
                  className="village-btn-secondary"
                >
                  Invoices
                </Link>
                <Link
                  href={`/dashboard/ledger?resident=${encodeURIComponent(resident.id)}`}
                  className="village-btn-secondary"
                >
                  Ledger
                </Link>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setPortraitError(null);
                setEditing(true);
              }}
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
      {portraitError ? (
        <p className="village-alert-error">{portraitError}</p>
      ) : null}

      <div className="flex flex-col gap-3 border-b border-pine/12 pb-4">
        <span className="village-field-label">Portrait</span>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="shrink-0">
            {portraitSrc ? (
              <img
                src={portraitSrc}
                alt={portraitAlt}
                className="h-20 w-20 rounded-2xl object-cover ring-1 ring-pine/15"
                width={80}
                height={80}
              />
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-2xl bg-pine/8 text-pine-2 ring-1 ring-pine/15"
                aria-label="No portrait"
              >
                <span className="text-lg font-semibold text-ink/45" aria-hidden>
                  {residentInitials(resident.fullName)}
                </span>
              </div>
            )}
          </div>
          {!isDeparted ? (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                id="resident-header-portrait-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                data-testid="resident-portrait-file"
                className="sr-only"
                onChange={handlePortraitFileChange}
                disabled={portraitBusy}
              />
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="resident-header-portrait-file"
                  className={`village-btn-secondary inline-flex cursor-pointer items-center justify-center ${portraitBusy ? "pointer-events-none opacity-60" : ""}`}
                >
                  Choose photo
                </label>
                <button
                  type="button"
                  className="rounded-lg border border-danger/35 bg-cream px-4 py-2 text-sm font-semibold text-danger shadow-sm transition hover:bg-danger/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/35 disabled:pointer-events-none disabled:opacity-50"
                  disabled={portraitBusy || !resident.hasPortrait}
                  onClick={handleRemovePortrait}
                >
                  Remove portrait
                </button>
              </div>
              {portraitBusy ? (
                <p className="text-sm text-ink/60">Updating portrait...</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

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
          onClick={() => {
            setPortraitError(null);
            setEditing(false);
          }}
          className="village-btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
