"use client";

import { VillageList, VillageListFilter } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

const MODAL_PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,#c2410c_78%,transparent)] bg-gradient-to-br from-[#fdba74] to-[#ea580c] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[inset_0_1px_0_color-mix(in_srgb,#fef3c7_45%,transparent),0_12px_24px_-16px_color-mix(in_srgb,#c2410c_78%,transparent)] transition-all duration-150 ease-out hover:-translate-y-px hover:saturate-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:saturate-100 min-h-10";

const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

type Supplier = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type Props = {
  canManageSuppliers: boolean;
};

type SupplierDraft = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

function defaultDraft(): SupplierDraft {
  return { name: "", address: "", phone: "", email: "" };
}

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string") return err;
    }
  } catch {
    // ignore
  }
  return "Request failed.";
}

const CONTACT_FILTER_OPTIONS = [
  { value: "all", label: "All contacts" },
  { value: "phone", label: "Has phone" },
  { value: "email", label: "Has email" },
] as const;

export function SuppliersPageClient({ canManageSuppliers }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<SupplierDraft>(defaultDraft);
  const [searchQuery, setSearchQuery] = useState("");
  const [contactFilter, setContactFilter] =
    useState<(typeof CONTACT_FILTER_OPTIONS)[number]["value"]>("all");

  const loadSuppliers = useCallback(async () => {
    if (!canManageSuppliers) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/inventory-suppliers", {
      cache: "no-store",
    });
    setLoading(false);
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { suppliers: Supplier[] };
    setSuppliers(json.suppliers);
  }, [canManageSuppliers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch updates list/loading like catalog client
    void loadSuppliers();
  }, [loadSuppliers]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (contactFilter === "phone" && !(s.phone && s.phone.trim()))
        return false;
      if (contactFilter === "email" && !(s.email && s.email.trim()))
        return false;
      if (!q) return true;
      const hay = [s.name, s.address ?? "", s.email ?? "", s.phone ?? ""]
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [suppliers, searchQuery, contactFilter]);

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) + (contactFilter !== "all" ? 1 : 0);

  const closeCreateModal = useCallback(() => {
    setCreateOpen(false);
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreateModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [createOpen, closeCreateModal]);

  async function createSupplier(e?: FormEvent) {
    e?.preventDefault();
    if (!canManageSuppliers || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory-suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setCreateOpen(false);
      setDraft(defaultDraft());
      await loadSuppliers();
    } finally {
      setSubmitting(false);
    }
  }

  if (!canManageSuppliers) {
    return (
      <div className="village-card p-8">
        You do not have access to any homes.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <VillageList
        rootElement="div"
        wrapBody="none"
        listTitle={null}
        filtersCollapsible
        activeFilterCount={activeFilterCount}
        error={error && !createOpen ? error : null}
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
                onClick={() => {
                  setError(null);
                  setCreateOpen(true);
                }}
              >
                Add a supplier
              </button>
            </div>
            <button
              type="button"
              className="village-btn-secondary shrink-0"
              onClick={() => void loadSuppliers()}
            >
              Refresh
            </button>
          </div>
        }
        filters={
          <>
            <VillageListFilter label="Home" htmlFor="suppliers-global-scope">
              <input
                id="suppliers-global-scope"
                readOnly
                className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
                value="All homes (shared suppliers)"
              />
            </VillageListFilter>
            <VillageListFilter
              label="Search"
              htmlFor="suppliers-search"
              minWidth="12rem"
            >
              <input
                id="suppliers-search"
                className="village-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, address, phone, or email"
                autoComplete="off"
              />
            </VillageListFilter>
            <VillageListFilter
              label="Contacts"
              htmlFor="suppliers-contact"
              width="11rem"
            >
              <VillageSelect
                id="suppliers-contact"
                value={contactFilter}
                onChange={(v) =>
                  setContactFilter(
                    v as (typeof CONTACT_FILTER_OPTIONS)[number]["value"],
                  )
                }
                options={[...CONTACT_FILTER_OPTIONS]}
              />
            </VillageListFilter>
          </>
        }
      >
        <section className="village-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold">Suppliers list</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {loading && suppliers.length === 0
                  ? "Loading suppliers…"
                  : `${filteredSuppliers.length} supplier${filteredSuppliers.length === 1 ? "" : "s"} shown`}
                {suppliers.length > 0 &&
                suppliers.length !== filteredSuppliers.length ? (
                  <span className="text-[var(--text-muted)]">
                    {" "}
                    ({suppliers.length} total)
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          {!loading && suppliers.length === 0 ? (
            <div className="px-5 py-10 text-center sm:px-6">
              <p className="text-base font-medium text-[var(--text-primary)]">
                No suppliers yet.
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Use{" "}
                <span className="font-semibold text-[var(--text-primary)]">
                  Add a supplier
                </span>{" "}
                to capture ordering contacts.
              </p>
            </div>
          ) : null}
          {!loading &&
          suppliers.length > 0 &&
          filteredSuppliers.length === 0 ? (
            <div className="px-5 py-10 text-center sm:px-6">
              <p className="text-base font-medium text-[var(--text-primary)]">
                No suppliers match these filters.
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Clear search or widen the contact filter.
              </p>
            </div>
          ) : null}
          {filteredSuppliers.length > 0 ? (
            <div
              className={[
                "overflow-x-auto",
                loading
                  ? "pointer-events-none opacity-50 transition-opacity duration-150 motion-reduce:transition-none"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[var(--text-secondary)]">
                    <th className="px-5 py-3 font-medium sm:px-6">
                      Supplier name
                    </th>
                    <th className="px-5 py-3 font-medium">Address</th>
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium sm:px-6">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.map((supplier) => (
                    <tr
                      key={supplier.id}
                      className="border-b border-[var(--line)]/85 align-top"
                    >
                      <td className="px-5 py-3 font-medium text-[var(--text-primary)] sm:px-6">
                        {supplier.name}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">
                        {supplier.address ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">
                        {supplier.phone ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)] sm:px-6">
                        {supplier.email ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </VillageList>

      {createOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss add supplier dialog"
                onClick={closeCreateModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="suppliers-create-modal-heading"
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
                              New supplier
                            </p>
                            <h2
                              id="suppliers-create-modal-heading"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              Add a supplier
                            </h2>
                            <p className="text-sm leading-6 text-ink/65">
                              Name, address, phone, and email for purchase
                              orders and follow-up across homes.
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                          <div className="rounded-2xl border border-pine/10 bg-cream/72 px-4 py-3 text-sm text-ink/65 shadow-sm">
                            <span className="font-semibold text-pine-2">
                              {suppliers.length}
                            </span>{" "}
                            supplier
                            {suppliers.length === 1 ? "" : "s"}
                          </div>
                          <button
                            type="button"
                            className={MODAL_CLOSE_BTN_CLASS}
                            onClick={closeCreateModal}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                    <form
                      id="suppliers-create-form"
                      className="grid gap-5 p-5 sm:p-6"
                      onSubmit={(e) => void createSupplier(e)}
                    >
                      <label
                        htmlFor="suppliers-create-name"
                        className="flex max-w-2xl flex-col gap-2"
                      >
                        <span className="village-label">Supplier name</span>
                        <input
                          id="suppliers-create-name"
                          className="village-input min-w-0"
                          placeholder="Legal or trading name"
                          value={draft.name}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, name: e.target.value }))
                          }
                          required
                          autoComplete="organization"
                        />
                      </label>
                      <label
                        htmlFor="suppliers-create-address"
                        className="flex max-w-2xl flex-col gap-2"
                      >
                        <span className="village-label">Address</span>
                        <textarea
                          id="suppliers-create-address"
                          className="village-input min-h-24 min-w-0 resize-y"
                          placeholder="Street, city, postcode"
                          value={draft.address}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, address: e.target.value }))
                          }
                          autoComplete="street-address"
                        />
                      </label>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                        <label
                          htmlFor="suppliers-create-phone"
                          className="flex min-w-[12rem] flex-1 flex-col gap-2"
                        >
                          <span className="village-label">Phone number</span>
                          <input
                            id="suppliers-create-phone"
                            className="village-input min-w-0"
                            placeholder="Contacts for ordering"
                            value={draft.phone}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, phone: e.target.value }))
                            }
                            autoComplete="tel"
                          />
                        </label>
                        <label
                          htmlFor="suppliers-create-email"
                          className="flex min-w-[12rem] flex-1 flex-col gap-2"
                        >
                          <span className="village-label">Email address</span>
                          <input
                            id="suppliers-create-email"
                            type="email"
                            className="village-input min-w-0"
                            placeholder="Billing or PO inbox"
                            value={draft.email}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, email: e.target.value }))
                            }
                            autoComplete="email"
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          form="suppliers-create-form"
                          type="submit"
                          className={MODAL_PRIMARY_BTN_CLASS}
                          disabled={submitting}
                        >
                          {submitting ? "Creating…" : "Create"}
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
    </div>
  );
}
