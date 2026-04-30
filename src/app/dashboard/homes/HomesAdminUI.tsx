"use client";

import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import type { Home } from "@/lib/homes/service";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type HomesAdminUIProps = {
  initialHomes: Home[];
  totalCount: number;
  page: number;
  pageSize: number;
  /** Care users see assigned homes only (no org-wide home settings). */
  variant?: "admin" | "care";
};

function buildHomesListPath(page: number, pageSize: number) {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("pageSize", String(pageSize));
  return `/dashboard/homes?${p.toString()}`;
}

export function HomesAdminUI({
  initialHomes,
  totalCount,
  page,
  pageSize,
  variant = "admin",
}: HomesAdminUIProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createCurrency, setCreateCurrency] = useState<string>(
    DEFAULT_CURRENCY_CODE,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("");

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

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/homes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createName,
        defaultCurrencyCode: createCurrency,
      }),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    setCreateName("");
    setCreateCurrency(DEFAULT_CURRENCY_CODE);
    router.push(buildHomesListPath(1, pageSize));
  }

  function startEdit(h: Home) {
    setEditingId(h.id);
    setEditName(h.name);
    setEditCurrency(h.defaultCurrencyCode);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditCurrency("");
  }

  async function onSaveEdit(homeId: string) {
    setError(null);
    const res = await fetch(`/api/homes/${homeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        defaultCurrencyCode: editCurrency,
      }),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    cancelEdit();
    router.refresh();
  }

  async function setArchived(homeId: string, archived: boolean) {
    setError(null);
    const res = await fetch(`/api/homes/${homeId}`, {
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
      <header>
        <h1 className="font-display text-3xl font-normal tracking-tight text-pine-2">
          Retirement homes
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/70">
          {variant === "admin"
            ? "Configure each site's name and default currency (ISO 4217)."
            : "Homes you are assigned to. Open a site to manage wards."}
        </p>
      </header>

      {error ? <p className="village-alert-error">{error}</p> : null}

      {variant === "admin" ? (
        <section className="village-card p-6 sm:p-8">
          <h2 className="village-section-title">Add a home</h2>
          <form
            onSubmit={onCreate}
            className="mt-5 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
          >
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm">
              <span className="village-field-label">Name</span>
              <input
                className="village-input"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <label className="flex w-full flex-col gap-1.5 text-sm sm:w-32">
              <span className="village-field-label">Currency</span>
              <input
                className="village-input uppercase"
                value={createCurrency}
                onChange={(e) =>
                  setCreateCurrency(e.target.value.toUpperCase())
                }
                required
                maxLength={3}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="village-btn-primary">
              Create
            </button>
          </form>
        </section>
      ) : null}

      <section className="village-card p-6 sm:p-8">
        <h2 className="village-section-title">
          {variant === "admin" ? "All homes" : "Your homes"}
        </h2>
        {initialHomes.length > 0 || totalCount > 0 ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              className="text-sm text-ink/70"
              data-testid="homes-directory-range"
            >
              {totalCount === 0
                ? "Showing 0 of 0"
                : (() => {
                    const lastPage = Math.max(
                      1,
                      Math.ceil(totalCount / pageSize),
                    );
                    const outOfRange = page > lastPage;
                    if (outOfRange) {
                      return `No results on this page (showing 0 of ${totalCount} homes).`;
                    }
                    const from = (page - 1) * pageSize + 1;
                    const to = Math.min(page * pageSize, totalCount);
                    return `Showing ${from}–${to} of ${totalCount}`;
                  })()}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => {
                  router.push(buildHomesListPath(page - 1, pageSize));
                }}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page * pageSize >= totalCount}
                onClick={() => {
                  router.push(buildHomesListPath(page + 1, pageSize));
                }}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
        <div className="village-table-wrap mt-5">
          <table className="village-table">
            <thead className="village-thead">
              <tr>
                <th className="village-th">Name</th>
                <th className="village-th">Default currency</th>
                <th className="village-th">Status</th>
                <th className="village-th">
                  {variant === "admin" ? "Residents / actions" : "Residents / wards"}
                </th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {initialHomes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="village-td-muted py-10 text-center">
                    {variant === "admin"
                      ? "No homes yet. Add one above."
                      : "You are not assigned to any home."}
                  </td>
                </tr>
              ) : (
                initialHomes.map((h) => (
                  <tr key={h.id}>
                    <td className="village-td font-medium">
                      {editingId === h.id ? (
                        <input
                          className="village-input w-full min-w-[10rem]"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      ) : (
                        h.name
                      )}
                    </td>
                    <td className="village-td-muted">
                      {editingId === h.id ? (
                        <input
                          className="village-input w-24 uppercase"
                          value={editCurrency}
                          onChange={(e) =>
                            setEditCurrency(e.target.value.toUpperCase())
                          }
                          maxLength={3}
                        />
                      ) : (
                        h.defaultCurrencyCode
                      )}
                    </td>
                    <td className="village-td-muted">
                      {h.archivedAtUtcMs != null ? "Archived" : "Active"}
                    </td>
                    <td className="village-td">
                      {variant === "care" ? (
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          <Link
                            href={`/dashboard/homes/${h.id}/residents`}
                            className="village-link"
                          >
                            Residents
                          </Link>
                          <Link
                            href={`/dashboard/homes/${h.id}/wards`}
                            className="village-link"
                          >
                            Wards
                          </Link>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <Link
                            href={`/dashboard/homes/${h.id}/residents`}
                            className="village-link"
                          >
                            Residents
                          </Link>
                          {editingId === h.id ? (
                            <>
                              <button
                                type="button"
                                className="village-btn-primary px-3 py-1.5 text-xs"
                                onClick={() => onSaveEdit(h.id)}
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
                            <>
                              <Link
                                href={`/dashboard/homes/${h.id}/wards`}
                                className="village-link"
                              >
                                Wards
                              </Link>
                              <button
                                type="button"
                                className="village-link cursor-pointer border-0 bg-transparent p-0"
                                onClick={() => startEdit(h)}
                              >
                                Edit
                              </button>
                            </>
                          )}
                          {h.archivedAtUtcMs != null ? (
                            <button
                              type="button"
                              className="text-sm font-semibold text-pine underline decoration-terracotta/35 underline-offset-[5px] transition hover:text-terracotta"
                              onClick={() => setArchived(h.id, false)}
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4 hover:opacity-90"
                              onClick={() => setArchived(h.id, true)}
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      )}
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
