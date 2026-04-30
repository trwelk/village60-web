"use client";

import { useState } from "react";
import type { ResidentWithoutFee } from "@/lib/residents/service";

type Props = {
  homeId: string;
  residentId: string;
  resident: ResidentWithoutFee;
};

export function PoaTab({ homeId, residentId, resident }: Props) {
  const [editing, setEditing] = useState(false);
  const [poaSameAsNok, setPoaSameAsNok] = useState(resident.poaSameAsNok);
  const [poaName, setPoaName] = useState(resident.poaName ?? "");
  const [poaRelationship, setPoaRelationship] = useState(resident.poaRelationship ?? "");
  const [poaContact, setPoaContact] = useState(resident.poaContact ?? "");
  const [saving, setSaving] = useState(false);

  const hasSeparatePoaData = Boolean(poaName || poaRelationship || poaContact);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/homes/${homeId}/residents/${residentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poaSameAsNok,
        poaName: poaSameAsNok ? null : poaName || null,
        poaContact: poaSameAsNok ? null : poaContact || null,
        poaRelationship: poaSameAsNok ? null : poaRelationship || null,
      }),
    });
    setSaving(false);
    setEditing(false);
  }

  function handleCancel() {
    setPoaSameAsNok(resident.poaSameAsNok);
    setPoaName(resident.poaName ?? "");
    setPoaRelationship(resident.poaRelationship ?? "");
    setPoaContact(resident.poaContact ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-5">
        <h3 className="village-section-title">Power of attorney</h3>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="village-checkbox shrink-0"
            checked={poaSameAsNok}
            onChange={(e) => setPoaSameAsNok(e.target.checked)}
          />
          <span className="village-field-label leading-snug">Same as Next of Kin</span>
        </label>
        {!poaSameAsNok ? (
          <div className="flex flex-col gap-4 border-t border-pine/12 pt-4">
            <label className="flex flex-col gap-1.5 text-sm" htmlFor="poa-name">
              <span className="village-field-label">Name</span>
              <input
                id="poa-name"
                type="text"
                className="village-input"
                value={poaName}
                onChange={(e) => setPoaName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm" htmlFor="poa-relationship">
              <span className="village-field-label">Relationship</span>
              <input
                id="poa-relationship"
                type="text"
                className="village-input"
                value={poaRelationship}
                onChange={(e) => setPoaRelationship(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm" htmlFor="poa-contact">
              <span className="village-field-label">Contact</span>
              <input
                id="poa-contact"
                type="text"
                className="village-input"
                value={poaContact}
                onChange={(e) => setPoaContact(e.target.value)}
              />
            </label>
          </div>
        ) : null}
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
      <h3 className="village-section-title">Power of attorney</h3>
      {poaSameAsNok ? (
        <p className="village-muted">Same as Next of Kin</p>
      ) : hasSeparatePoaData ? (
        <div className="flex flex-col gap-2">
          {poaName ? (
            <div className="village-list-row flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="village-field-label">Name</span>
              <span className="font-medium text-ink">{poaName}</span>
            </div>
          ) : null}
          {poaRelationship ? (
            <div className="village-list-row flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="village-field-label">Relationship</span>
              <span className="font-medium text-ink">{poaRelationship}</span>
            </div>
          ) : null}
          {poaContact ? (
            <div className="village-list-row flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="village-field-label">Contact</span>
              <span className="font-medium text-ink">{poaContact}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="village-muted">No POA recorded.</p>
      )}
      <button type="button" className="village-btn-secondary self-start" onClick={() => setEditing(true)}>
        Edit
      </button>
    </div>
  );
}
