"use client";

import {
  INTEREST_LEAD_STATUSES,
  type AdminInterestLeadListItem,
} from "@/lib/homeInterestLeads/service";
import {
  INTEREST_LEAD_STATUS_LABELS,
  KANBAN_STAGE_ORDER,
  leadsInKanbanColumn,
  type KanbanStageStatus,
} from "@/lib/homeInterestLeads/growthMetrics";
import { VillageSelect } from "@/components/VillageSelect";
import { useCallback, useState } from "react";

type WaitingListFunnelBoardProps = {
  leads: AdminInterestLeadListItem[];
  submittedFmt: Intl.DateTimeFormat;
  statusSavingId: string | null;
  onStatusChange: (leadId: string, status: string) => Promise<void>;
};

const COLUMN_COPY: Record<
  KanbanStageStatus,
  { title: string; subtitle: string }
> = {
  new: { title: "New", subtitle: "Awaiting first touch" },
  contacted: { title: "Contacted", subtitle: "In conversation" },
  closed: { title: "Completed", subtitle: "Finalized or won" },
  cancelled: { title: "Disqualified", subtitle: "Won't proceed" },
};

const DRAG_MIME = "text/plain";

const FUNNEL_STATUS_OPTIONS = INTEREST_LEAD_STATUSES.map((s) => ({
  value: s,
  label: INTEREST_LEAD_STATUS_LABELS[s],
}));

export function WaitingListFunnelBoard({
  leads,
  submittedFmt,
  statusSavingId,
  onStatusChange,
}: WaitingListFunnelBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHoverStatus, setDropHoverStatus] =
    useState<KanbanStageStatus | null>(null);

  const onDragStart = useCallback((leadId: string) => {
    setDraggingId(leadId);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropHoverStatus(null);
  }, []);

  const handleDrop = useCallback(
    async (status: KanbanStageStatus, e: React.DragEvent) => {
      e.preventDefault();
      setDropHoverStatus(null);
      const id = e.dataTransfer.getData(DRAG_MIME).trim();
      setDraggingId(null);
      if (!id) return;
      const lead = leads.find((l) => l.id === id);
      if (!lead || lead.status === status) return;
      await onStatusChange(id, status);
    },
    [leads, onStatusChange],
  );

  return (
    <div className="flex min-h-0 gap-3 overflow-x-auto pb-1 lg:gap-4">
      {KANBAN_STAGE_ORDER.map((status) => {
        const copy = COLUMN_COPY[status];
        const columnLeads = leadsInKanbanColumn(leads, status);
        const highlighted = dropHoverStatus === status && draggingId;

        return (
          <section
            key={status}
            className={[
              "flex w-[min(100%,18.5rem)] shrink-0 flex-col rounded-2xl border bg-[color-mix(in_srgb,var(--bg-muted)_55%,var(--bg-elevated)_45%)] px-2.5 pb-2.5 pt-3 transition-[box-shadow,background-color] motion-reduce:transition-none",
              highlighted
                ? "border-[color-mix(in_srgb,var(--accent-strong)_55%,var(--line-strong)_45%)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_42%,transparent)]"
                : "border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)]",
            ].join(" ")}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropHoverStatus(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropHoverStatus(null);
              }
            }}
            onDrop={(e) => void handleDrop(status, e)}
          >
            <header className="mb-3 px-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {copy.title}
                </h3>
                <span className="rounded-full bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-secondary)] ring-1 ring-[color-mix(in_srgb,var(--line-subtle)_70%,transparent)]">
                  {columnLeads.length}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-[var(--text-secondary)]">
                {copy.subtitle}
              </p>
            </header>
            <ul className="flex min-h-[12rem] flex-col gap-2 lg:min-h-[14rem]">
              {columnLeads.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--line-subtle)_92%,transparent)] px-3 py-8 text-center text-xs text-ink/45">
                  Drop enquiries here
                </li>
              ) : (
                columnLeads.map((row) => (
                  <li key={row.id}>
                    <article
                      draggable={statusSavingId !== row.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, row.id);
                        e.dataTransfer.effectAllowed = "move";
                        onDragStart(row.id);
                      }}
                      onDragEnd={onDragEnd}
                      className={[
                        "rounded-xl border border-[color-mix(in_srgb,var(--line-subtle)_82%,transparent)] bg-[var(--bg-elevated)] p-3 shadow-sm transition-shadow motion-reduce:transition-none",
                        draggingId === row.id
                          ? "opacity-[0.92] shadow-md ring-1 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                          : "",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate font-medium text-[var(--text-primary)]">
                          {row.contactName}
                        </p>
                        <span
                          className={[
                            "shrink-0 rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ring-1",
                            row.source === "web"
                              ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-pine-2 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                              : "bg-[color-mix(in_srgb,var(--highlight)_14%,transparent)] text-ink ring-[color-mix(in_srgb,var(--highlight)_38%,transparent)]",
                          ].join(" ")}
                        >
                          {row.source}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                        <span className="font-medium text-[var(--text-primary)]">
                          {row.homeNameSnapshot}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-ink/60">{row.phone}</p>
                      <time
                        className="mt-2 block text-[0.68rem] text-ink/48"
                        dateTime={new Date(row.createdAtUtcMs).toISOString()}
                      >
                        {submittedFmt.format(new Date(row.createdAtUtcMs))}
                      </time>
                      <label className="mt-2 flex flex-col gap-1">
                        <span className="sr-only">
                          Status for {row.contactName}
                        </span>
                        <VillageSelect
                          className="[&_.village-select-trigger]:min-h-0 [&_.village-select-trigger]:py-1.5 [&_.village-select-trigger]:text-xs"
                          value={row.status}
                          disabled={statusSavingId === row.id}
                          ariaLabel={`Status for ${row.contactName}`}
                          onChange={(v) =>
                            void onStatusChange(row.id, v)
                          }
                          options={FUNNEL_STATUS_OPTIONS}
                        />
                      </label>
                    </article>
                  </li>
                ))
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
