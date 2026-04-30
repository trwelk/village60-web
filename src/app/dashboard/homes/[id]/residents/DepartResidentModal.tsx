"use client";

import { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  homeId: string;
  residentId: string;
  onDeparted: () => void;
};

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

export function DepartResidentModal({
  open,
  onClose,
  homeId,
  residentId,
  onDeparted,
}: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return null;
  }

  function handleDismiss() {
    if (submitting) return;
    setReason("");
    setError(null);
    onClose();
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/homes/${homeId}/residents/${residentId}/depart`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setReason("");
      onDeparted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Dismiss dialog"
        onClick={handleDismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="depart-modal-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-pine/15 bg-cream/95 p-6 shadow-[0_24px_64px_-24px_rgba(12,24,20,0.45)] backdrop-blur-[2px]"
      >
        <h2
          id="depart-modal-title"
          className="font-display text-lg font-normal tracking-tight text-pine-2"
        >
          Depart resident
        </h2>
        <p className="mt-2 text-sm text-ink/70">
          Records a departure reason and clears ward and room. To change this
          later, contact an administrator.
        </p>

        {error ? (
          <p className="village-alert-error mt-3">{error}</p>
        ) : null}

        <form onSubmit={handleConfirm} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="village-field-label">Reason</span>
            <textarea
              className="village-input min-h-[5rem] resize-y"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              autoFocus
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg border border-danger/35 bg-cream px-4 py-2 text-sm font-semibold text-danger shadow-sm transition hover:bg-danger/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/35 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Confirming…" : "Confirm depart"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleDismiss}
              className="village-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
