"use client";

import {
  type ResidentOtherChargeListItem,
} from "@/lib/billing/otherCharges";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Props = {
  homeId: string;
  residentId: string;
  defaultCurrencyCode: string;
  /** When marking received, empty paid-on defaults to this ISO date. */
  admissionDate: string;
};

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

function otherChargeLabel(type: ResidentOtherChargeListItem["type"]): string {
  if (type === "registration") {
    return "Registration fee";
  }
  return "Deposit";
}

export function OtherChargeTab({
  homeId,
  residentId,
  defaultCurrencyCode,
  admissionDate,
}: Props) {
  const [otherCharges, setOtherCharges] = useState<ResidentOtherChargeListItem[]>(
    [],
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  const [editingOtherId, setEditingOtherId] = useState<string | null>(null);
  const [editOtherAmount, setEditOtherAmount] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    const u = new URL(`/api/homes/${homeId}/other-charges`, window.location.origin);
    u.searchParams.set("residentId", residentId);
    u.searchParams.set("status", "all");
    u.searchParams.set("page", "1");
    u.searchParams.set("pageSize", "100");
    const res = await fetch(u.toString());
    if (!res.ok) {
      setLoadError("Could not load other charges.");
      setLoading(false);
      return;
    }
    const data: unknown = await res.json();
    const rec =
      typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
    const rows = Array.isArray(rec.rows) ? rec.rows : [];
    const oc: ResidentOtherChargeListItem[] = [];
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const o = row as Record<string, unknown>;
      if (
        typeof o.id !== "string" ||
        typeof o.residentId !== "string" ||
        (o.type !== "registration" && o.type !== "deposit") ||
        typeof o.amountMinor !== "number"
      ) {
        continue;
      }
      oc.push({
        id: o.id,
        residentId: o.residentId,
        type: o.type as "registration" | "deposit",
        amountMinor: o.amountMinor,
      });
    }
    setOtherCharges(oc);
    setLoading(false);
  }, [homeId, residentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function parseError(res: Response): Promise<string> {
    try {
      const data: unknown = await res.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
      ) {
        const msg = (data as { error: string; month?: string }).error;
        const m = (data as { month?: unknown }).month;
        if (typeof m === "string" && m.length > 0) {
          return `${msg} (${m})`;
        }
        return msg;
      }
    } catch {
      /* ignore */
    }
    return "Request failed.";
  }

  function startEditOther(row: ResidentOtherChargeListItem) {
    setActionError(null);
    setEditingOtherId(row.id);
    setEditOtherAmount(String(row.amountMinor));
  }

  function cancelEditOther() {
    setEditingOtherId(null);
    setEditOtherAmount("");
  }

  async function setUpOtherCharges() {
    setActionError(null);
    setInitializing(true);
    const res = await fetch(
      `/api/homes/${homeId}/residents/${residentId}/other-charges/initialize`,
      { method: "POST" },
    );
    setInitializing(false);
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    await load();
  }

  async function saveEditOther(id: string) {
    setActionError(null);
    const amountMinor = Number.parseInt(editOtherAmount, 10);
    if (Number.isNaN(amountMinor) || amountMinor < 0) {
      setActionError("Amount (minor units) must be a non-negative integer.");
      return;
    }
    const body: Record<string, unknown> = {
      amountMinor,
    };
    const res = await fetch(
      `/api/homes/${homeId}/residents/${residentId}/other-charges/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    cancelEditOther();
    await load();
  }

  if (loading) {
    return (
      <div className="text-sm text-ink/70">Loading other charges…</div>
    );
  }

  if (loadError) {
    return <p className="village-alert-error">{loadError}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        data-testid="resident-other-charges"
        className="rounded-lg border border-ink/10 bg-ink/[0.02] p-4 sm:p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="village-section-title">Registration & deposit</h3>
            <p className="mt-2 text-sm text-ink/70">
              One-off intake charges. Update amounts here.
            </p>
          </div>
          <Link
            href={`/dashboard/homes/${homeId}/ledger?residentId=${encodeURIComponent(residentId)}`}
            className="village-btn-secondary px-4 py-2 text-sm whitespace-nowrap"
          >
            View resident charges
          </Link>
        </div>
        {otherCharges.length < 2 ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <p className="text-sm text-ink/65">
              {otherCharges.length === 0
                ? "No registration or deposit on file yet. Create the lines with default zero amounts, then edit before recording if needed."
                : "One of the registration or deposit lines is missing. Add the missing line with a default zero amount, then edit if needed."}
            </p>
            <button
              type="button"
              className="village-btn-primary shrink-0 self-start px-3 py-1.5 text-sm"
              disabled={initializing}
              onClick={() => void setUpOtherCharges()}
              data-testid="other-charges-set-up"
            >
              {initializing ? "Setting up…" : "Set up registration & deposit"}
            </button>
          </div>
        ) : null}
        {otherCharges.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-4">
            {otherCharges.map((row) => (
              <li
                key={row.id}
                className="grid gap-2 border-t border-ink/10 pt-4 text-sm first:border-t-0 first:pt-0 sm:grid-cols-2"
              >
                {editingOtherId !== row.id ? (
                  <>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        {otherChargeLabel(row.type)}
                      </div>
                      <div className="mt-1 font-medium text-ink">
                        {formatMinorAsCurrency(
                          row.amountMinor,
                          defaultCurrencyCode,
                        )}
                      </div>
                      <div className="text-xs text-ink/55">
                        {row.amountMinor} minor
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 text-ink/80 items-start">
                      <button
                        type="button"
                        className="village-link border-0 bg-transparent p-0 text-sm font-semibold text-pine underline"
                        onClick={() => startEditOther(row)}
                      >
                        Edit
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="sm:col-span-2 flex min-w-0 flex-col gap-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      {otherChargeLabel(row.type)}
                    </div>
                    <label className="flex max-w-md flex-col gap-1 text-xs">
                      <span className="village-field-label">
                        Amount ({defaultCurrencyCode} minor units)
                      </span>
                      <input
                        className="village-input"
                        inputMode="numeric"
                        value={editOtherAmount}
                        onChange={(e) => setEditOtherAmount(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="village-btn-primary px-3 py-1 text-xs"
                        onClick={() => void saveEditOther(row.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="village-btn-secondary px-3 py-1 text-xs"
                        onClick={cancelEditOther}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {actionError ? <p className="village-alert-error">{actionError}</p> : null}
    </div>
  );
}
