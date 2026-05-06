"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { useEffect, useRef, useState } from "react";
import type { ResidentPublic } from "@/lib/residents/service";

type Props = {
  homeId: string;
  residentId: string;
  resident: ResidentPublic;
  careStaffOptions: { id: string; email: string }[];
};

export function AssignedNurseTab({ homeId, residentId, resident, careStaffOptions }: Props) {
  const [editing, setEditing] = useState(false);
  const [nurseUserId, setNurseUserId] = useState(resident.assignedNurseUserId ?? "");
  const [displayOverride, setDisplayOverride] = useState(
    resident.assignedNurseDisplayOverride ?? "",
  );
  const [saving, setSaving] = useState(false);

  /** Last values that match successful save or props; avoids stale parent `resident` after PATCH. */
  const persistedRef = useRef({
    nurseUserId: resident.assignedNurseUserId ?? "",
    displayOverride: resident.assignedNurseDisplayOverride ?? "",
  });

  useEffect(() => {
    const nu = resident.assignedNurseUserId ?? "";
    const d = resident.assignedNurseDisplayOverride ?? "";
    setNurseUserId(nu);
    setDisplayOverride(d);
    persistedRef.current = { nurseUserId: nu, displayOverride: d };
  }, [
    resident.id,
    resident.assignedNurseUserId,
    resident.assignedNurseDisplayOverride,
  ]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/homes/${homeId}/residents/${residentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedNurseUserId: nurseUserId || null,
          assignedNurseDisplayOverride: displayOverride || null,
        }),
      });
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (res.ok) {
        let nextNu = nurseUserId;
        let nextD = displayOverride;
        if (
          typeof data === "object" &&
          data !== null &&
          "resident" in data &&
          typeof (data as { resident?: unknown }).resident === "object" &&
          (data as { resident: ResidentPublic | null }).resident !== null
        ) {
          const next = (data as { resident: ResidentPublic }).resident;
          nextNu = next.assignedNurseUserId ?? "";
          nextD = next.assignedNurseDisplayOverride ?? "";
        }
        setNurseUserId(nextNu);
        setDisplayOverride(nextD);
        persistedRef.current = { nurseUserId: nextNu, displayOverride: nextD };
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    const p = persistedRef.current;
    setNurseUserId(p.nurseUserId);
    setDisplayOverride(p.displayOverride);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-5">
        <h3 className="village-section-title">Assigned nurse</h3>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-sm">
            <label className="village-field-label" htmlFor="nurse-select">
              Nurse
            </label>
            <VillageSelect
              id="nurse-select"
              value={nurseUserId}
              onChange={setNurseUserId}
              options={[
                { value: "", label: "None" },
                ...careStaffOptions.map((u) => ({
                  value: u.id,
                  label: u.email,
                })),
              ]}
            />
          </div>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="nurse-override">
            <span className="village-field-label">Display override</span>
            <input
              id="nurse-override"
              type="text"
              className="village-input"
              value={displayOverride}
              onChange={(e) => setDisplayOverride(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="village-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            Save
          </button>
          <button type="button" className="village-btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const nurse = careStaffOptions.find((u) => u.id === nurseUserId);
  const displayText =
    nurse?.email ?? (displayOverride.trim() ? displayOverride : null);

  return (
    <div className="flex flex-col gap-5">
      <h3 className="village-section-title">Assigned nurse</h3>
      {displayText ? (
        <div className="village-list-row">
          <span className="village-field-label shrink-0">Contact</span>
          <span className="min-w-0 font-medium text-ink">{displayText}</span>
        </div>
      ) : (
        <p className="village-muted">No nurse assigned.</p>
      )}
      <button type="button" className="village-btn-secondary self-start" onClick={() => setEditing(true)}>
        Edit
      </button>
    </div>
  );
}
