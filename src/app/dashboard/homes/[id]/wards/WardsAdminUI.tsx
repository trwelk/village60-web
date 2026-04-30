"use client";

import type { Home } from "@/lib/homes/service";
import type { WardListItem } from "@/lib/wards/service";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type WardsAdminUIProps = {
  home: Home;
  initialWards: WardListItem[];
};

function formatMinorAsHomeCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

const navLinkClass =
  "self-start text-sm font-semibold text-pine underline decoration-terracotta/35 underline-offset-[5px] transition hover:text-terracotta hover:decoration-terracotta/60 sm:self-center";

export function WardsAdminUI({ home, initialWards }: WardsAdminUIProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [createLabel, setCreateLabel] = useState("");
  const [createSort, setCreateSort] = useState("");
  const [createBeds, setCreateBeds] = useState("");
  const [createMonthlyRate, setCreateMonthlyRate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSort, setEditSort] = useState("");
  const [editBeds, setEditBeds] = useState("");
  const [editMonthlyRate, setEditMonthlyRate] = useState("");

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

  function sortInputToPayload(raw: string): number | null | undefined {
    const t = raw.trim();
    if (t === "") return undefined;
    const n = Number(t);
    if (!Number.isFinite(n)) return undefined;
    return n;
  }

  /** Empty → omit; valid non-negative integer → number; invalid → null sentinel for caller to reject. */
  function monthlyRateInputToPayload(
    raw: string,
  ): number | null | undefined | "invalid" {
    const t = raw.trim();
    if (t === "") return undefined;
    const n = Number(t);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return "invalid";
    }
    return n;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const sortOrder = sortInputToPayload(createSort);
    const body: {
      label: string;
      sortOrder?: number | null;
      bedCount?: number | null;
      monthlyRatePerPersonMinor?: number | null;
    } = {
      label: createLabel,
    };
    if (sortOrder !== undefined) {
      body.sortOrder = sortOrder;
    }
    if (createBeds.trim() !== "") {
      const n = Number(createBeds.trim());
      if (!Number.isInteger(n) || n < 0) {
        setError("Number of beds must be a non-negative whole number or empty.");
        return;
      }
      body.bedCount = n;
    }
    const ratePayload = monthlyRateInputToPayload(createMonthlyRate);
    if (ratePayload === "invalid") {
      setError(
        "Monthly rate (minor units) must be a non-negative whole number or empty.",
      );
      return;
    }
    if (ratePayload !== undefined) {
      body.monthlyRatePerPersonMinor = ratePayload;
    }
    const res = await fetch(`/api/homes/${home.id}/wards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    setCreateLabel("");
    setCreateSort("");
    setCreateBeds("");
    setCreateMonthlyRate("");
    router.refresh();
  }

  function startEdit(w: WardListItem) {
    setEditingId(w.id);
    setEditLabel(w.label);
    setEditSort(
      w.sortOrder == null ? "" : String(w.sortOrder),
    );
    setEditBeds(w.bedCount == null ? "" : String(w.bedCount));
    setEditMonthlyRate(
      w.monthlyRatePerPersonMinor == null
        ? ""
        : String(w.monthlyRatePerPersonMinor),
    );
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditSort("");
    setEditBeds("");
    setEditMonthlyRate("");
  }

  async function onSaveEdit(wardId: string) {
    setError(null);
    const sortOrder = sortInputToPayload(editSort);
    const body: {
      label: string;
      sortOrder?: number | null;
      bedCount?: number | null;
      monthlyRatePerPersonMinor?: number | null;
    } = {
      label: editLabel,
    };
    if (editSort.trim() === "") {
      body.sortOrder = null;
    } else if (sortOrder !== undefined) {
      body.sortOrder = sortOrder;
    }
    if (editBeds.trim() === "") {
      body.bedCount = null;
    } else {
      const n = Number(editBeds.trim());
      if (!Number.isInteger(n) || n < 0) {
        setError("Number of beds must be a non-negative whole number or empty.");
        return;
      }
      body.bedCount = n;
    }
    const editRatePayload = monthlyRateInputToPayload(editMonthlyRate);
    if (editRatePayload === "invalid") {
      setError(
        "Monthly rate (minor units) must be a non-negative whole number or empty.",
      );
      return;
    }
    if (editMonthlyRate.trim() === "") {
      body.monthlyRatePerPersonMinor = null;
    } else if (editRatePayload !== undefined) {
      body.monthlyRatePerPersonMinor = editRatePayload;
    }
    const res = await fetch(`/api/homes/${home.id}/wards/${wardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    cancelEdit();
    router.refresh();
  }

  async function setArchived(wardId: string, archived: boolean) {
    setError(null);
    const res = await fetch(`/api/homes/${home.id}/wards/${wardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    router.refresh();
  }

  return (
    <main className="flex flex-col gap-8 text-ink">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-3xl font-normal tracking-tight text-pine-2">
            Wards & units — {home.name}
          </h1>
          <p className="mt-2 text-sm text-ink/70">
            Labels for placement (optional sort order; archived rows stay out of
            default picks later). Monthly rate is per resident in that ward in{" "}
            {home.defaultCurrencyCode} minor units (e.g. cents); multiple beds on
            the ward do not multiply the rate per person.
          </p>
        </div>
        <Link href="/dashboard/homes" className={navLinkClass}>
          Back to homes
        </Link>
      </header>

      {error ? <p className="village-alert-error">{error}</p> : null}

      <section className="village-card p-6 sm:p-8">
        <h2 className="village-section-title">Add a ward or unit</h2>
        <form
          onSubmit={onCreate}
          className="mt-5 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm">
            <span className="village-field-label">Label</span>
            <input
              className="village-input"
              value={createLabel}
              onChange={(e) => setCreateLabel(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label className="flex w-full flex-col gap-1.5 text-sm sm:w-36">
            <span className="village-field-label">Sort</span>
            <input
              className="village-input"
              value={createSort}
              onChange={(e) => setCreateSort(e.target.value)}
              placeholder="optional"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          <label className="flex w-full flex-col gap-1.5 text-sm sm:w-36">
            <span className="village-field-label">Beds</span>
            <input
              className="village-input"
              value={createBeds}
              onChange={(e) => setCreateBeds(e.target.value)}
              placeholder="optional"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm sm:max-w-xs">
            <span className="village-field-label">
              Monthly rate / person (minor)
            </span>
            <input
              className="village-input"
              value={createMonthlyRate}
              onChange={(e) => setCreateMonthlyRate(e.target.value)}
              placeholder="optional"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="village-btn-primary">
            Add
          </button>
        </form>
      </section>

      <section className="village-card p-6 sm:p-8">
        <h2 className="village-section-title">Wards for this home</h2>
        <div className="village-table-wrap mt-5">
          <table className="village-table">
            <thead className="village-thead">
              <tr>
                <th className="village-th">Label</th>
                <th className="village-th">Sort</th>
                <th className="village-th">Beds</th>
                <th className="village-th">Monthly / person</th>
                <th className="village-th">Status</th>
                <th className="village-th">Actions</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {initialWards.length === 0 ? (
                <tr>
                  <td colSpan={6} className="village-td-muted py-10 text-center">
                    No wards yet. Add one above.
                  </td>
                </tr>
              ) : (
                initialWards.map((w) => (
                  <tr key={w.id}>
                    <td className="village-td font-medium">
                      {editingId === w.id ? (
                        <input
                          className="village-input w-full min-w-[10rem]"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                        />
                      ) : (
                        w.label
                      )}
                    </td>
                    <td className="village-td-muted">
                      {editingId === w.id ? (
                        <input
                          className="village-input w-24"
                          value={editSort}
                          onChange={(e) => setEditSort(e.target.value)}
                          inputMode="numeric"
                        />
                      ) : w.sortOrder == null ? (
                        "—"
                      ) : (
                        w.sortOrder
                      )}
                    </td>
                    <td className="village-td-muted">
                      {editingId === w.id ? (
                        <input
                          className="village-input w-24"
                          value={editBeds}
                          onChange={(e) => setEditBeds(e.target.value)}
                          inputMode="numeric"
                          placeholder="—"
                        />
                      ) : w.bedCount == null ? (
                        "—"
                      ) : (
                        w.bedCount
                      )}
                    </td>
                    <td className="village-td-muted text-xs sm:text-sm">
                      {editingId === w.id ? (
                        <input
                          className="village-input w-full min-w-[7rem]"
                          value={editMonthlyRate}
                          onChange={(e) => setEditMonthlyRate(e.target.value)}
                          inputMode="numeric"
                          placeholder="minor units"
                        />
                      ) : w.monthlyRatePerPersonMinor == null ? (
                        "—"
                      ) : (
                        <span className="block">
                          <span className="font-medium text-ink">
                            {formatMinorAsHomeCurrency(
                              w.monthlyRatePerPersonMinor,
                              home.defaultCurrencyCode,
                            )}
                          </span>
                          <span className="mt-0.5 block text-ink/60">
                            {w.monthlyRatePerPersonMinor} minor
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="village-td-muted">
                      {w.archivedAtUtcMs != null ? "Archived" : "Active"}
                    </td>
                    <td className="village-td">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {editingId === w.id ? (
                          <>
                            <button
                              type="button"
                              className="village-btn-primary px-3 py-1.5 text-xs"
                              onClick={() => onSaveEdit(w.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="village-btn-secondary px-3 py-1.5 text-xs"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="village-link cursor-pointer border-0 bg-transparent p-0"
                            onClick={() => startEdit(w)}
                          >
                            Edit
                          </button>
                        )}
                        {w.archivedAtUtcMs != null ? (
                          <button
                            type="button"
                            className="text-sm font-semibold text-pine underline decoration-terracotta/35 underline-offset-[5px] transition hover:text-terracotta"
                            onClick={() => setArchived(w.id, false)}
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4 hover:opacity-90"
                            onClick={() => setArchived(w.id, true)}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
