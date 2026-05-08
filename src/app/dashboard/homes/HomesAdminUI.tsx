"use client";

import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import type { Home } from "@/lib/homes/service";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

const MODAL_PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,#c2410c_78%,transparent)] bg-gradient-to-br from-[#fdba74] to-[#ea580c] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,#fef3c7_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,#c2410c_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100 min-h-10";

const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

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
  const [createAddress, setCreateAddress] = useState("");
  const [createCurrency, setCreateCurrency] = useState<string>(
    DEFAULT_CURRENCY_CODE,
  );
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCurrency, setEditCurrency] = useState("");

  const closeCreateHomeModal = useCallback(() => {
    setCreateModalOpen(false);
  }, []);

  const openCreateHomeModal = useCallback(() => {
    setError(null);
    setCreateModalOpen(true);
  }, []);

  useEffect(() => {
    if (!createModalOpen || variant !== "admin") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreateHomeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [createModalOpen, variant, closeCreateHomeModal]);

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
    setCreatePending(true);
    try {
      const res = await fetch("/api/homes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          defaultCurrencyCode: createCurrency,
          address: createAddress,
        }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setCreateName("");
      setCreateAddress("");
      setCreateCurrency(DEFAULT_CURRENCY_CODE);
      router.push(buildHomesListPath(1, pageSize));
      closeCreateHomeModal();
    } finally {
      setCreatePending(false);
    }
  }

  function startEdit(h: Home) {
    setEditingId(h.id);
    setEditName(h.name);
    setEditAddress(h.address ?? "");
    setEditCurrency(h.defaultCurrencyCode);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditAddress("");
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
        address: editAddress.trim() === "" ? null : editAddress,
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
      {error && !(variant === "admin" && createModalOpen) ? (
        <p className="village-alert-error">{error}</p>
      ) : null}

      <section className="village-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="village-section-title mb-0">
            {variant === "admin" ? "All homes" : "Your homes"}
          </h2>
          {variant === "admin" ? (
            <button
              type="button"
              className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
              onClick={openCreateHomeModal}
            >
              Add a home
            </button>
          ) : null}
        </div>
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
                <th className="village-th">Address</th>
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
                  <td colSpan={5} className="village-td-muted py-10 text-center">
                    {variant === "admin"
                      ? "No homes yet. Use Add a home to create one."
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
                    <td className="village-td-muted max-w-[14rem] align-top text-sm">
                      {editingId === h.id ? (
                        <textarea
                          className="village-input min-h-[4.5rem] w-full resize-y text-sm"
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          rows={3}
                          autoComplete="street-address"
                        />
                      ) : h.address ? (
                        <span className="whitespace-pre-wrap text-ink/85">
                          {h.address}
                        </span>
                      ) : (
                        <span className="text-ink/45">—</span>
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

      {variant === "admin" && createModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss add home dialog"
                onClick={closeCreateHomeModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="homes-create-modal-heading"
                data-testid="homes-create-panel"
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] shadow-[0_-8px_40px_-12px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl sm:shadow-[0_22px_60px_-24px_color-mix(in_srgb,var(--text-primary)_38%,transparent)]"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex max-w-2xl gap-4">
                          <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine text-lg font-display text-cream shadow-[0_14px_34px_-20px_rgba(26,77,58,0.8)]">
                            +
                          </div>
                          <div className="flex flex-col gap-1">
                            <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
                              New retirement home
                            </p>
                            <h2
                              id="homes-create-modal-heading"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              Add a home
                            </h2>
                            <p className="text-sm leading-6 text-ink/65">
                              Name, ISO 4217 currency, and optional address used on public
                              enquiry flows.
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                          <div className="rounded-2xl border border-pine/10 bg-cream/72 px-4 py-3 text-sm text-ink/65 shadow-sm">
                            <span className="font-semibold text-pine-2">
                              Currency
                            </span>{" "}
                            <span className="font-mono font-semibold text-pine-2">
                              {createCurrency || DEFAULT_CURRENCY_CODE}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={MODAL_CLOSE_BTN_CLASS}
                            onClick={closeCreateHomeModal}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                    <form
                      id="homes-create-form"
                      className="grid gap-5 p-5 sm:p-6"
                      onSubmit={onCreate}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                        <label
                          htmlFor="homes-create-name"
                          className="flex min-w-[12rem] flex-1 flex-col gap-2"
                        >
                          <span className="village-label">Name</span>
                          <input
                            id="homes-create-name"
                            className="village-input min-w-0"
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            required
                            autoComplete="off"
                          />
                        </label>
                        <label
                          htmlFor="homes-create-currency"
                          className="flex w-full flex-col gap-2 sm:w-32 sm:min-w-[8rem]"
                        >
                          <span className="village-label">Currency</span>
                          <input
                            id="homes-create-currency"
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
                      </div>
                      <div className="flex max-w-2xl flex-col gap-2">
                        <label
                          htmlFor="homes-create-address"
                          className="village-label"
                        >
                          Address (optional)
                        </label>
                        <textarea
                          id="homes-create-address"
                          className="village-input mt-2 min-h-28 resize-y"
                          value={createAddress}
                          onChange={(e) => setCreateAddress(e.target.value)}
                          rows={3}
                          autoComplete="street-address"
                          placeholder="Optional details"
                        />
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          form="homes-create-form"
                          type="submit"
                          className={MODAL_PRIMARY_BTN_CLASS}
                          disabled={createPending}
                        >
                          {createPending ? "Creating…" : "Create"}
                        </button>
                        {error ? (
                          <p className="text-sm font-medium text-terracotta">
                            {error}
                          </p>
                        ) : null}
                      </div>
                    </form>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </main>
  );
}
