"use client";

import { useCallback, useEffect, useState } from "react";

type ConditionRow = { id: string; label: string };

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

export function ConditionsTab({ homeId, residentId }: Props) {
  const base = `/api/homes/${homeId}/residents/${residentId}/clinical`;
  const [conditions, setConditions] = useState<ConditionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [addLabel, setAddLabel] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(base);
    if (!res.ok) {
      setLoadError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { conditions: ConditionRow[] };
    setConditions(json.conditions);
  }, [base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loadError) {
    return <p className="village-alert-error">{loadError}</p>;
  }

  if (conditions === null) {
    return <p className="village-muted">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <h3 className="village-section-title">Conditions</h3>
      {actionError ? <p className="village-alert-error">{actionError}</p> : null}

      <ul className="flex flex-col gap-2 text-sm">
        {conditions.map((c) => (
          <li key={c.id} className="village-list-row flex-wrap items-center gap-2">
            {editId === c.id ? (
              <>
                <input
                  className="village-input min-w-[12rem] flex-1"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                />
                <button
                  type="button"
                  className="village-btn-primary text-xs sm:text-sm"
                  onClick={async () => {
                    setActionError(null);
                    const res = await fetch(`${base}/conditions/${c.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ label: editLabel }),
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
              </>
            ) : confirmDeleteId === c.id ? (
              <>
                <span className="min-w-0 flex-1 font-medium text-ink">{c.label}</span>
                <span className="village-muted">Remove?</span>
                <button
                  type="button"
                  className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4"
                  onClick={async () => {
                    setActionError(null);
                    const res = await fetch(`${base}/conditions/${c.id}`, {
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
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 font-medium text-ink">{c.label}</span>
                <button
                  type="button"
                  className="village-link text-sm"
                  onClick={() => {
                    setEditId(c.id);
                    setEditLabel(c.label);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4"
                  onClick={() => setConfirmDeleteId(c.id)}
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-3 border-t border-pine/12 pt-4">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm">
          <span className="village-field-label">Add condition</span>
          <input
            className="village-input"
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder="e.g. Hypertension"
          />
        </label>
        <button
          type="button"
          className="village-btn-primary"
          onClick={async () => {
            setActionError(null);
            const res = await fetch(`${base}/conditions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ label: addLabel }),
            });
            if (!res.ok) {
              setActionError(await parseError(res));
              return;
            }
            setAddLabel("");
            await refresh();
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
