"use client";

import { VillageSelect } from "@/components/VillageSelect";
import {
  INTEREST_LEAD_STATUSES,
  type AdminInterestLeadListItem,
  type PublicInterestHomeOption,
} from "@/lib/homeInterestLeads/service";
import {
  buildLeadGrowthSnapshot,
  INTEREST_LEAD_STATUS_LABELS,
} from "@/lib/homeInterestLeads/growthMetrics";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { translateWith } from "@/lib/i18n/messages";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { INVOICE_MODAL_PRIMARY_BTN_CLASS as MODAL_PRIMARY_BTN_CLASS } from "@/app/dashboard/invoices/invoiceModalStyles";
import { WaitingListFunnelBoard } from "./WaitingListFunnelBoard";

type WaitingListAdminUIProps = {
  initialLeads: AdminInterestLeadListItem[];
  homes: PublicInterestHomeOption[];
  residentCountByHomeId: Record<string, number>;
};

const submittedFmt = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

const LEAD_STATUS_SELECT_OPTIONS = INTEREST_LEAD_STATUSES.map((s) => ({
  value: s,
  label: INTEREST_LEAD_STATUS_LABELS[s],
}));

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

export function WaitingListAdminUI({
  initialLeads,
  homes,
  residentCountByHomeId,
}: WaitingListAdminUIProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [view, setView] = useState<"pipeline" | "table">("pipeline");

  const snapshot = useMemo(
    () =>
      buildLeadGrowthSnapshot(initialLeads, homes, residentCountByHomeId),
    [initialLeads, homes, residentCountByHomeId],
  );

  const [createHomeId, setCreateHomeId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const closeCreateLeadModal = useCallback(() => {
    setCreateModalOpen(false);
  }, []);

  const openCreateLeadModal = useCallback(() => {
    setError(null);
    setCreateModalOpen(true);
  }, []);

  useEffect(() => {
    if (!createModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreateLeadModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [createModalOpen, closeCreateLeadModal]);

  const onStatusChange = useCallback(
    async (leadId: string, status: string) => {
      setStatusSavingId(leadId);
      setError(null);
      try {
        const res = await fetch(`/api/dashboard/interest-leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          setError(await parseError(res));
          return;
        }
        router.refresh();
      } finally {
        setStatusSavingId(null);
      }
    },
    [router],
  );

  async function onCreateLead(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!createHomeId.trim()) {
      setError("Select a home.");
      return;
    }
    setCreatePending(true);
    try {
      const res = await fetch("/api/dashboard/interest-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeId: createHomeId,
          contactName: createName,
          phone: createPhone,
          email: createEmail.trim() === "" ? null : createEmail,
          note: createNote.trim() === "" ? null : createNote,
        }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setCreateHomeId("");
      setCreateName("");
      setCreatePhone("");
      setCreateEmail("");
      setCreateNote("");
      router.refresh();
      closeCreateLeadModal();
    } finally {
      setCreatePending(false);
    }
  }

  return (
    <main className="flex flex-col gap-8 text-ink">
      {error && !createModalOpen ? (
        <p className="village-alert-error">{error}</p>
      ) : null}

      <section className="village-card p-6 sm:p-8">
        <h2 className="village-section-title">{t("sections.growthSnapshot")}</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink/70">
          {t("waitingList.growthHint")}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-4 py-3">
            <span className="village-field-label block">Active pipeline</span>
            <span className="mt-1 block font-display text-2xl tabular-nums text-[var(--text-primary)]">
              {snapshot.pipelineTotal}
            </span>
            <span className="mt-1 block text-xs text-ink/58">
              {snapshot.countsByStatus.new} {t("waitingList.statusNew")} ·{" "}
              {snapshot.countsByStatus.contacted} {t("waitingList.statusContacted")}
            </span>
          </div>
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-4 py-3">
            <span className="village-field-label block">Completed</span>
            <span className="mt-1 block font-display text-2xl tabular-nums text-[var(--text-primary)]">
              {snapshot.closedWon}
            </span>
            <span className="mt-1 block text-xs text-ink/58">
              {t("waitingList.finalizedWon")}
            </span>
          </div>
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-4 py-3">
            <span className="village-field-label block">Disqualified</span>
            <span className="mt-1 block font-display text-2xl tabular-nums text-[var(--text-primary)]">
              {snapshot.cancelledLost}
            </span>
            <span className="mt-1 block text-xs text-ink/58">
              {t("waitingList.wontProceed")}
            </span>
          </div>
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-4 py-3">
            <span className="village-field-label block">Win rate</span>
            <span className="mt-1 block font-display text-2xl tabular-nums text-[var(--text-primary)]">
              {snapshot.winRatePercent == null
                ? "—"
                : `${snapshot.winRatePercent}%`}
            </span>
            <span className="mt-1 block text-xs text-ink/58">
              {t("waitingList.winRateFormula")}
            </span>
          </div>
        </div>

        <h3 className="mt-10 text-sm font-semibold uppercase tracking-wide text-ink/55">
          {t("waitingList.bySite")}
        </h3>
        <div className="village-table-wrap mt-3">
          <table className="village-table">
            <thead className="village-thead">
              <tr>
                <th className="village-th">Home</th>
                <th className="village-th">Residents / beds</th>
                <th className="village-th">Spare capacity</th>
                <th className="village-th">Open pipeline</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {snapshot.homeRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="village-td-muted py-10 text-center"
                  >
                    {t("waitingList.noActiveHomes")}
                  </td>
                </tr>
              ) : (
                snapshot.homeRows.map((row) => (
                  <tr key={row.homeId}>
                    <td className="village-td font-medium">{row.homeName}</td>
                    <td className="village-td-muted tabular-nums text-sm">
                      {row.configuredBeds > 0 ? (
                        <>
                          {row.residentCount} / {row.configuredBeds}
                        </>
                      ) : (
                        <span title={t("waitingList.noWardBeds")}>
                          {row.residentCount}{" "}
                          <span className="text-ink/45">
                            · {t("waitingList.noBedCap")}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="village-td-muted tabular-nums text-sm">
                      {row.configuredBeds > 0 ? (
                        row.spareBeds > 0 ? (
                          translateWith(locale, "waitingList.bedsCount", {
                            count: row.spareBeds,
                          })
                        ) : (
                          <span className="font-medium text-terracotta">
                            {t("waitingList.atCapacity")}
                          </span>
                        )
                      ) : (
                        <span className="text-ink/45">—</span>
                      )}
                    </td>
                    <td className="village-td-muted tabular-nums text-sm">
                      {row.openPipelineCount > 0 ? (
                        <span className="font-semibold text-[var(--text-primary)]">
                          {row.openPipelineCount}
                        </span>
                      ) : (
                        <span className="text-ink/45">0</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="village-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="village-section-title mb-0">
            {t("sections.waitingList")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_40%,transparent)] p-0.5"
              role="group"
              aria-label={t("filters.waitingListView")}
            >
              <button
                type="button"
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  view === "pipeline"
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                ].join(" ")}
                onClick={() => setView("pipeline")}
              >
                {t("waitingList.pipeline")}
              </button>
              <button
                type="button"
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  view === "table"
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                ].join(" ")}
                onClick={() => setView("table")}
              >
                {t("waitingList.table")}
              </button>
            </div>
            <button
              type="button"
              className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
              onClick={openCreateLeadModal}
            >
              {t("buttons.addToWaitingList")}
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-ink/70">
          {view === "pipeline"
            ? t("waitingList.pipelineHint")
            : t("waitingList.tableHint")}
        </p>
        {view === "pipeline" ? (
          <div className="mt-5">
            <WaitingListFunnelBoard
              leads={initialLeads}
              submittedFmt={submittedFmt}
              statusSavingId={statusSavingId}
              onStatusChange={onStatusChange}
            />
          </div>
        ) : (
          <div className="village-table-wrap mt-5">
            <table className="village-table">
              <thead className="village-thead">
                <tr>
                  <th className="village-th">Submitted</th>
                  <th className="village-th">Name</th>
                  <th className="village-th">Phone</th>
                  <th className="village-th">Email</th>
                  <th className="village-th">Home</th>
                  <th className="village-th">Note</th>
                  <th className="village-th">Status</th>
                </tr>
              </thead>
              <tbody className="village-tbody">
                {initialLeads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="village-td-muted py-10 text-center"
                    >
                      The waiting list is empty.
                    </td>
                  </tr>
                ) : (
                  initialLeads.map((row) => (
                    <tr key={row.id}>
                      <td className="village-td-muted whitespace-nowrap text-sm">
                        {submittedFmt.format(new Date(row.createdAtUtcMs))}
                      </td>
                      <td className="village-td font-medium">
                        {row.contactName}
                      </td>
                      <td className="village-td-muted">{row.phone}</td>
                      <td className="village-td-muted">
                        {row.email ?? <span className="text-ink/45">—</span>}
                      </td>
                      <td className="village-td-muted">
                        <span className="font-medium text-ink">
                          {row.homeNameSnapshot}
                        </span>
                        {row.homeAddressSnapshot ? (
                          <span className="mt-1 block text-xs text-ink/55">
                            {row.homeAddressSnapshot}
                          </span>
                        ) : null}
                      </td>
                      <td className="village-td-muted max-w-[14rem] text-sm">
                        {row.note ? (
                          <span className="line-clamp-3">{row.note}</span>
                        ) : (
                          <span className="text-ink/45">—</span>
                        )}
                      </td>
                      <td className="village-td align-top">
                        <VillageSelect
                          className="max-w-[11rem] [&_.village-select-trigger]:min-h-0 [&_.village-select-trigger]:py-1.5 [&_.village-select-trigger]:text-sm"
                          value={row.status}
                          disabled={statusSavingId === row.id}
                          ariaLabel={`Status for ${row.contactName}`}
                          onChange={(v) => onStatusChange(row.id, v)}
                          options={LEAD_STATUS_SELECT_OPTIONS}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss add to waiting list dialog"
                onClick={closeCreateLeadModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="waiting-list-create-modal-heading"
                data-testid="waiting-list-create-panel"
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] shadow-[0_-8px_40px_-12px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl sm:shadow-[0_22px_60px_-24px_color-mix(in_srgb,var(--text-primary)_38%,transparent)]"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex max-w-2xl gap-4">
                          <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_82%,var(--highlight)_18%),var(--accent-strong))] text-lg font-display text-[var(--bg-elevated)] shadow-[0_14px_34px_-18px_color-mix(in_srgb,var(--accent-strong)_85%,transparent)]">
                            +
                          </div>
                          <div className="flex flex-col gap-1">
                            <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
                              New waiting list entry
                            </p>
                            <h2
                              id="waiting-list-create-modal-heading"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              Add someone to the waiting list
                            </h2>
                            <p className="text-sm leading-6 text-ink/65">
                              Saves home and contact snapshots at submission; only
                              status can change on existing rows.
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                          <div className="rounded-2xl border border-pine/10 bg-cream/72 px-4 py-3 text-sm text-ink/65 shadow-sm">
                            <span className="font-semibold text-pine-2">
                              {homes.length}
                            </span>{" "}
                            active catalogue{" "}
                            {homes.length === 1 ? "home" : "homes"}
                          </div>
                          <button
                            type="button"
                            className={MODAL_CLOSE_BTN_CLASS}
                            onClick={closeCreateLeadModal}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                    {homes.length === 0 ? (
                      <div className="space-y-4 p-5 sm:p-6">
                        <p className="text-sm leading-relaxed text-ink/70">
                          There are no active homes to attach to a waiting list entry.
                          Restore or create a home first.
                        </p>
                        <button
                          type="button"
                          className="village-btn-secondary px-5 py-2.5 text-sm font-semibold"
                          onClick={closeCreateLeadModal}
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      <form
                        id="waiting-list-create-form"
                        className="grid gap-5 p-5 sm:p-6"
                        onSubmit={onCreateLead}
                      >
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="waiting-list-create-home"
                              className="village-label"
                            >
                              Home
                            </label>
                            <VillageSelect
                              id="waiting-list-create-home"
                              className="w-full min-w-0"
                              value={createHomeId}
                              onChange={setCreateHomeId}
                              placeholder="Select a home"
                              ariaRequired
                              options={homes.map((h) => ({
                                value: h.id,
                                label: h.name,
                              }))}
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="waiting-list-create-name"
                              className="village-label"
                            >
                              Name
                            </label>
                            <input
                              id="waiting-list-create-name"
                              className="village-input min-w-0"
                              value={createName}
                              onChange={(e) => setCreateName(e.target.value)}
                              required
                              autoComplete="name"
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="waiting-list-create-phone"
                              className="village-label"
                            >
                              Phone
                            </label>
                            <input
                              id="waiting-list-create-phone"
                              className="village-input min-w-0"
                              type="tel"
                              value={createPhone}
                              onChange={(e) => setCreatePhone(e.target.value)}
                              required
                              autoComplete="tel"
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="waiting-list-create-email"
                              className="village-label"
                            >
                              Email (optional)
                            </label>
                            <input
                              id="waiting-list-create-email"
                              className="village-input min-w-0"
                              type="email"
                              value={createEmail}
                              onChange={(e) => setCreateEmail(e.target.value)}
                              autoComplete="email"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <label
                            htmlFor="waiting-list-create-note"
                            className="village-label"
                          >
                            Notes (optional)
                          </label>
                          <textarea
                            id="waiting-list-create-note"
                            className="village-input mt-2 min-h-28 resize-y"
                            value={createNote}
                            onChange={(e) => setCreateNote(e.target.value)}
                            placeholder="Optional details"
                          />
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <button
                            form="waiting-list-create-form"
                            type="submit"
                            className={MODAL_PRIMARY_BTN_CLASS}
                            disabled={createPending}
                          >
                            {createPending ? "Saving…" : "Save"}
                          </button>
                          {error ? (
                            <p className="text-sm font-medium text-terracotta">
                              {error}
                            </p>
                          ) : null}
                        </div>
                      </form>
                    )}
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
