"use client";

import { useCallback, useEffect, useState } from "react";

type MedicationRow = {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  timingNotes: string | null;
  prn: boolean;
};

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

const prnBadgeClass =
  "ml-2 inline-flex rounded-full bg-pine-soft px-2 py-0.5 text-xs font-semibold text-pine";

export function MedicationsTab({ homeId, residentId }: Props) {
  const base = `/api/homes/${homeId}/residents/${residentId}/clinical`;
  const [medications, setMedications] = useState<MedicationRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [addName, setAddName] = useState("");
  const [addDose, setAddDose] = useState("");
  const [addFreq, setAddFreq] = useState("");
  const [addTiming, setAddTiming] = useState("");
  const [addPrn, setAddPrn] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDose, setEditDose] = useState("");
  const [editFreq, setEditFreq] = useState("");
  const [editTiming, setEditTiming] = useState("");
  const [editPrn, setEditPrn] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(base);
    if (!res.ok) {
      setLoadError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { medications: MedicationRow[] };
    setMedications(json.medications);
  }, [base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loadError) {
    return <p className="village-alert-error">{loadError}</p>;
  }

  if (medications === null) {
    return <p className="village-muted">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <h3 className="village-section-title">Medications</h3>
      {actionError ? <p className="village-alert-error">{actionError}</p> : null}

      <ul className="flex flex-col gap-2 text-sm">
        {medications.map((m) => (
          <li key={m.id} className="village-list-row flex-col gap-2 sm:flex-row sm:items-start">
            {editId === m.id ? (
              <div className="flex w-full flex-col gap-2">
                <input
                  className="village-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Name"
                />
                <input
                  className="village-input"
                  value={editDose}
                  onChange={(e) => setEditDose(e.target.value)}
                  placeholder="Dose"
                />
                <input
                  className="village-input"
                  value={editFreq}
                  onChange={(e) => setEditFreq(e.target.value)}
                  placeholder="Frequency"
                />
                <input
                  className="village-input"
                  value={editTiming}
                  onChange={(e) => setEditTiming(e.target.value)}
                  placeholder="Timing notes (optional)"
                />
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="village-checkbox"
                    checked={editPrn}
                    onChange={(e) => setEditPrn(e.target.checked)}
                  />
                  <span className="village-field-label">PRN</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="village-btn-primary text-xs sm:text-sm"
                    onClick={async () => {
                      setActionError(null);
                      const res = await fetch(`${base}/medications/${m.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: editName,
                          dose: editDose,
                          frequency: editFreq,
                          timingNotes: editTiming.trim() || null,
                          prn: editPrn,
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
            ) : confirmDeleteId === m.id ? (
              <div className="flex w-full flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{m.name}</span>
                  {m.prn ? <span className={prnBadgeClass}>PRN</span> : null}
                  <p className="mt-0.5 text-ink/80">
                    {m.dose} · {m.frequency}
                  </p>
                </div>
                <span className="village-muted">Remove?</span>
                <button
                  type="button"
                  className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4"
                  onClick={async () => {
                    setActionError(null);
                    const res = await fetch(`${base}/medications/${m.id}`, {
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
                  <span className="font-medium text-ink">{m.name}</span>
                  {m.prn ? <span className={prnBadgeClass}>PRN</span> : null}
                  <p className="mt-0.5 text-ink/80">
                    {m.dose} · {m.frequency}
                  </p>
                  {m.timingNotes ? (
                    <p className="mt-0.5 text-ink/65">{m.timingNotes}</p>
                  ) : null}
                </div>
                <button type="button" className="village-link text-sm" onClick={() => {
                  setEditId(m.id);
                  setEditName(m.name);
                  setEditDose(m.dose);
                  setEditFreq(m.frequency);
                  setEditTiming(m.timingNotes ?? "");
                  setEditPrn(m.prn);
                }}>
                  Edit
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4"
                  onClick={() => setConfirmDeleteId(m.id)}
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="village-card-soft flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1.5 text-sm">
            <span className="village-field-label">Name</span>
            <input
              className="village-input"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Name"
            />
          </label>
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1.5 text-sm">
            <span className="village-field-label">Dose</span>
            <input
              className="village-input"
              value={addDose}
              onChange={(e) => setAddDose(e.target.value)}
              placeholder="Dose"
            />
          </label>
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1.5 text-sm">
            <span className="village-field-label">Frequency</span>
            <input
              className="village-input"
              value={addFreq}
              onChange={(e) => setAddFreq(e.target.value)}
              placeholder="Frequency"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="village-field-label">Timing notes (optional)</span>
          <input
            className="village-input"
            value={addTiming}
            onChange={(e) => setAddTiming(e.target.value)}
            placeholder="Timing notes (optional)"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="village-checkbox"
            checked={addPrn}
            onChange={(e) => setAddPrn(e.target.checked)}
          />
          <span className="village-field-label">PRN (as needed)</span>
        </label>
        <button
          type="button"
          className="village-btn-primary w-fit"
          onClick={async () => {
            setActionError(null);
            const res = await fetch(`${base}/medications`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: addName,
                dose: addDose,
                frequency: addFreq,
                timingNotes: addTiming.trim() || null,
                prn: addPrn,
              }),
            });
            if (!res.ok) {
              setActionError(await parseError(res));
              return;
            }
            setAddName("");
            setAddDose("");
            setAddFreq("");
            setAddTiming("");
            setAddPrn(false);
            await refresh();
          }}
        >
          Add medication
        </button>
      </div>
    </div>
  );
}
