"use client";

import { useState } from "react";
import type { ResidentWithoutFee } from "@/lib/residents/service";

type Props = {
  homeId: string;
  residentId: string;
  resident: ResidentWithoutFee;
};

export function NokTab({ homeId, residentId, resident }: Props) {
  const [editing, setEditing] = useState(false);
  const [nokName, setNokName] = useState(resident.nokName ?? "");
  const [nokRelationship, setNokRelationship] = useState(resident.nokRelationship ?? "");
  const [nokContact, setNokContact] = useState(resident.nokContact ?? "");
  const [saving, setSaving] = useState(false);

  const hasData = Boolean(nokName || nokRelationship || nokContact);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/homes/${homeId}/residents/${residentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nokName: nokName || null,
        nokContact: nokContact || null,
        nokRelationship: nokRelationship || null,
      }),
    });
    setSaving(false);
    setEditing(false);
  }

  function handleCancel() {
    setNokName(resident.nokName ?? "");
    setNokRelationship(resident.nokRelationship ?? "");
    setNokContact(resident.nokContact ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-5">
        <h3 className="village-section-title">Next of kin</h3>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="nok-name">
            <span className="village-field-label">Name</span>
            <input
              id="nok-name"
              type="text"
              className="village-input"
              value={nokName}
              onChange={(e) => setNokName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="nok-relationship">
            <span className="village-field-label">Relationship</span>
            <input
              id="nok-relationship"
              type="text"
              className="village-input"
              value={nokRelationship}
              onChange={(e) => setNokRelationship(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="nok-contact">
            <span className="village-field-label">Contact</span>
            <input
              id="nok-contact"
              type="text"
              className="village-input"
              value={nokContact}
              onChange={(e) => setNokContact(e.target.value)}
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

  return (
    <div className="flex flex-col gap-5">
      <h3 className="village-section-title">Next of kin</h3>
      {hasData ? (
        <div className="flex flex-col gap-2">
          {nokName ? (
            <div className="village-list-row flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="village-field-label">Name</span>
              <span className="font-medium text-ink">{nokName}</span>
            </div>
          ) : null}
          {nokRelationship ? (
            <div className="village-list-row flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="village-field-label">Relationship</span>
              <span className="font-medium text-ink">{nokRelationship}</span>
            </div>
          ) : null}
          {nokContact ? (
            <div className="village-list-row flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="village-field-label">Contact</span>
              <span className="font-medium text-ink">{nokContact}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="village-muted">No next of kin recorded.</p>
      )}
      <button type="button" className="village-btn-secondary self-start" onClick={() => setEditing(true)}>
        Edit
      </button>
    </div>
  );
}
