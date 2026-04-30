"use client";

import { useCallback, useEffect, useState } from "react";

type AllergyRow = { id: string; allergen: string; notes: string | null };

type Props = { homeId: string; residentId: string };

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

export function AllergiesTab({ homeId, residentId }: Props) {
  const base = `/api/homes/${homeId}/residents/${residentId}/clinical`;
  const [allergies, setAllergies] = useState<AllergyRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [addAllergen, setAddAllergen] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editAllergen, setEditAllergen] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(base);
    if (!res.ok) {
      setLoadError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { allergies: AllergyRow[] };
    setAllergies(json.allergies);
  }, [base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loadError) {
    return <p className="village-alert-error">{loadError}</p>;
  }

  if (allergies === null) {
    return <p className="village-muted">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <h3 className="village-section-title">Allergies</h3>
      {actionError ? <p className="village-alert-error">{actionError}</p> : null}

      <ul className="flex flex-col gap-2 text-sm">
        {allergies.map((a) => (
          <li key={a.id} className="village-list-row flex-col gap-2 sm:flex-row sm:items-start">
            {editId === a.id ? (
              <div className="flex w-full flex-col gap-2">
                <input
                  className="village-input"
                  value={editAllergen}
                  onChange={(e) => setEditAllergen(e.target.value)}
                  placeholder="Allergen"
                />
                <input
                  className="village-input"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes (optional)"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="village-btn-primary text-xs sm:text-sm"
                    onClick={async () => {
                      setActionError(null);
                      const res = await fetch(`${base}/allergies/${a.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          allergen: editAllergen,
                          notes: editNotes.trim() || null,
                        }),
                      });
                      if (!res.ok) {
                        setActionError(await parseError(res));
                        return;
                      }
                      setEditId(null);
                      await refresh();
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="village-btn-secondary text-xs sm:text-sm"
                    onClick={() => setEditId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : confirmDeleteId === a.id ? (
              <div className="flex w-full flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{a.allergen}</span>
                  {a.notes ? <p className="mt-0.5 text-ink/70">{a.notes}</p> : null}
                </div>
                <span className="village-muted">Remove?</span>
                <button
                  type="button"
                  className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4"
                  onClick={async () => {
                    setActionError(null);
                    const res = await fetch(`${base}/allergies/${a.id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok && res.status !== 204) {
                      setActionError(await parseError(res));
                      return;
                    }
                    setConfirmDeleteId(null);
                    await refresh();
                  }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="village-link-subtle text-sm"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex w-full flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{a.allergen}</span>
                  {a.notes ? <p className="mt-0.5 text-ink/70">{a.notes}</p> : null}
                </div>
                <button type="button" className="village-link text-sm" onClick={() => {
                  setEditId(a.id);
                  setEditAllergen(a.allergen);
                  setEditNotes(a.notes ?? "");
                }}>
                  Edit
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4"
                  onClick={() => setConfirmDeleteId(a.id)}
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t border-pine/12 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm">
          <span className="village-field-label">Allergen</span>
          <input
            className="village-input"
            value={addAllergen}
            onChange={(e) => setAddAllergen(e.target.value)}
            placeholder="Allergen"
          />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm">
          <span className="village-field-label">Notes (optional)</span>
          <input
            className="village-input"
            value={addNotes}
            onChange={(e) => setAddNotes(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="village-btn-primary w-fit"
          onClick={async () => {
            setActionError(null);
            const res = await fetch(`${base}/allergies`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                allergen: addAllergen,
                notes: addNotes.trim() || null,
              }),
            });
            if (!res.ok) {
              setActionError(await parseError(res));
              return;
            }
            setAddAllergen("");
            setAddNotes("");
            await refresh();
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
