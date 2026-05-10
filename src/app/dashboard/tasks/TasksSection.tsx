"use client";

import type {
  CompletedManualItem,
  InboxItem,
  TaskInboxListQuery,
  TaskListItem,
  TaskPriority,
} from "@/lib/tasks/service";
import { VillageSelect } from "@/components/VillageSelect";
import {
  Cake,
  CalendarClock,
  ClipboardList,
  Inbox,
  Plus,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const DEFAULT_INBOX_QUERY: TaskInboxListQuery = {
  status: "open",
  homeId: null,
  inboxType: "all",
};

function buildTasksPath(q: TaskInboxListQuery): string {
  const p = new URLSearchParams();
  if (q.status === "completed") {
    p.set("status", "completed");
  }
  if (q.homeId) {
    p.set("home", q.homeId);
  }
  if (q.inboxType !== "all") {
    p.set("type", q.inboxType);
  }
  const s = p.toString();
  return s ? `/dashboard/tasks?${s}` : "/dashboard/tasks";
}

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

type HomeOption = { id: string; name: string };

type Props = {
  homes: HomeOption[];
  tasks: InboxItem[] | CompletedManualItem[];
  query?: TaskInboxListQuery;
};

type TaskDraft = {
  homeId: string;
  title: string;
  notes: string;
  dueDate: string;
  priority: TaskPriority;
};

const emptyDraft = (homeId: string): TaskDraft => ({
  homeId,
  title: "",
  notes: "",
  dueDate: "",
  priority: "normal",
});

function draftFromTask(task: TaskListItem): TaskDraft {
  return {
    homeId: task.homeId,
    title: task.title,
    notes: task.notes ?? "",
    dueDate: task.dueDate ?? "",
    priority: task.priority,
  };
}

function dueLabel(dueDate: string | null): string {
  return dueDate ? `Due ${dueDate}` : "No due date";
}

const inputClass = "village-input w-full";
const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent" },
];
const taskCardClass =
  "village-lift relative overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_78%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_94%,transparent)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_72%,transparent),var(--shadow-sm)] motion-reduce:transform-none sm:p-4";

function homePill(label: string) {
  return (
    <span className="inline-flex max-w-[min(100%,14rem)] items-center truncate rounded-full bg-[var(--partner-green-muted)] px-2.5 py-0.5 text-[0.8125rem] font-semibold text-[var(--text-primary)] ring-1 ring-[color-mix(in_srgb,var(--partner-green)_28%,transparent)]">
      {label}
    </span>
  );
}

function typePill(
  label: string,
  tone: "neutral" | "warm" | "urgent" | "payment" | "birthday" = "neutral",
) {
  const toneClass =
    tone === "urgent"
      ? "bg-[color-mix(in_srgb,var(--danger)_14%,var(--bg-elevated))] text-[var(--danger)] ring-[color-mix(in_srgb,var(--danger)_32%,transparent)]"
      : tone === "payment"
        ? "bg-[color-mix(in_srgb,var(--warning)_16%,var(--bg-elevated))] text-[color-mix(in_srgb,var(--accent-strong)_55%,var(--warning)_45%)] ring-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
        : tone === "birthday"
          ? "bg-[color-mix(in_srgb,var(--highlight)_18%,var(--bg-elevated))] text-[var(--accent-strong)] ring-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
          : tone === "warm"
            ? "bg-[color-mix(in_srgb,var(--bg-muted)_55%,var(--bg-elevated))] text-[var(--text-secondary)] ring-[color:color-mix(in_srgb,var(--line-subtle)_70%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--bg-muted)_40%,var(--bg-elevated))] text-[var(--text-muted)] ring-[color:color-mix(in_srgb,var(--line-subtle)_65%,transparent)]";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ring-1",
        toneClass,
      ].join(" ")}
    >
      {label}
    </span>
  );
}

export function TasksSection({
  homes,
  tasks,
  query: queryProp,
}: Props) {
  const query = queryProp ?? DEFAULT_INBOX_QUERY;
  const router = useRouter();
  const firstHomeId = homes[0]?.id ?? "";
  const [createDraft, setCreateDraft] = useState(() => emptyDraft(firstHomeId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TaskDraft>(() => emptyDraft(firstHomeId));
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const closeCreateTaskModal = useCallback(() => {
    setCreateModalOpen(false);
  }, []);

  const openCreateTaskModal = useCallback(() => {
    setError(null);
    setCreateModalOpen(true);
  }, []);

  useEffect(() => {
    if (!createModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreateTaskModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [createModalOpen, closeCreateTaskModal]);

  const homeNameById = useMemo(
    () => new Map(homes.map((home) => [home.id, home.name])),
    [homes],
  );

  async function submitJson(url: string, init: RequestInit): Promise<void> {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? "Task request failed.");
    }
  }

  function navigateInbox(next: TaskInboxListQuery) {
    router.push(buildTasksPath(next));
    router.refresh();
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createDraft.homeId || !createDraft.title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await submitJson("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          homeId: createDraft.homeId,
          title: createDraft.title,
          notes: createDraft.notes || null,
          dueDate: createDraft.dueDate || null,
          priority: createDraft.priority,
        }),
      });
      setCreateDraft(emptyDraft(createDraft.homeId));
      router.refresh();
      closeCreateTaskModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task request failed.");
    } finally {
      setCreating(false);
    }
  }

  async function onSave(taskId: string) {
    if (!editDraft.title.trim()) return;
    setBusyId(taskId);
    setError(null);
    try {
      await submitJson(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          homeId: editDraft.homeId,
          title: editDraft.title,
          notes: editDraft.notes || null,
          dueDate: editDraft.dueDate || null,
          priority: editDraft.priority,
        }),
      });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task request failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onComplete(taskId: string) {
    setBusyId(taskId);
    setError(null);
    try {
      await submitJson(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task request failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(taskId: string) {
    setBusyId(taskId);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Task request failed.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task request failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (homes.length === 0) {
    return (
      <p className="village-muted mt-4">
        No accessible homes yet. Tasks appear after you have at least one home.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        className="village-reveal village-reveal-delay-2 space-y-4"
        aria-labelledby="tasks-inbox-heading"
      >
        <div className="village-panel-card overflow-hidden p-0">
          <div
            className="h-1 bg-gradient-to-r from-[var(--accent)] via-[var(--highlight)] to-[var(--partner-green)]"
            aria-hidden
          />
          <div className="p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <span
                  className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,var(--bg-elevated))] text-[var(--accent-strong)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_65%,transparent)]"
                  aria-hidden
                >
                  <Inbox className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Inbox controls
                  </p>
                  <h2
                    id="tasks-inbox-heading"
                    className="font-display text-lg font-normal tracking-tight text-[var(--text-primary)] sm:text-xl"
                  >
                    Prioritise what needs attention
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
                    Filter open items by home and type. Manual tasks can be edited,
                    completed, or removed; reminders open their destination.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
                <button
                  type="button"
                  className="village-btn-primary inline-flex min-h-10 items-center justify-center gap-1.5 self-stretch px-4 text-sm sm:self-auto"
                  onClick={openCreateTaskModal}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  New manual task
                </button>
                <p className="text-center text-xs font-medium tabular-nums text-[var(--text-muted)] sm:text-right">
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--partner-green)_12%,var(--bg-elevated))] px-2.5 py-1 ring-1 ring-[color-mix(in_srgb,var(--partner-green)_22%,transparent)]">
                    {tasks.length} {tasks.length === 1 ? "item" : "items"} shown
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-xl border border-[color:color-mix(in_srgb,var(--line-subtle)_70%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_55%,transparent)] p-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label htmlFor="inbox-status" className="village-label">
              Status
            </label>
            <VillageSelect
              id="inbox-status"
              className="w-full"
              value={query.status}
              onChange={(v) => {
                if (v !== "open" && v !== "completed") {
                  return;
                }
                navigateInbox({ ...query, status: v });
              }}
              options={[
                { value: "open", label: "Open" },
                { value: "completed", label: "Completed (manual only)" },
              ]}
            />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label htmlFor="inbox-home" className="village-label">
              Home
            </label>
            <VillageSelect
              id="inbox-home"
              className="w-full"
              value={query.homeId ?? ""}
              onChange={(v) => {
                navigateInbox({
                  ...query,
                  homeId: v === "" ? null : v,
                });
              }}
              options={[
                { value: "", label: "All accessible homes" },
                ...homes.map((home) => ({
                  value: home.id,
                  label: home.name,
                })),
              ]}
            />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xs">
            <label htmlFor="inbox-type" className="village-label">
              Type
            </label>
            <VillageSelect
              id="inbox-type"
              className="w-full"
              value={query.inboxType}
              onChange={(v) => {
                if (
                  v === "all" ||
                  v === "manual" ||
                  v === "payment_overdue" ||
                  v === "birthday"
                ) {
                  navigateInbox({
                    ...query,
                    inboxType: v,
                  });
                }
              }}
              options={[
                { value: "all", label: "All" },
                { value: "manual", label: "Manual tasks" },
                { value: "payment_overdue", label: "Payment overdue" },
                { value: "birthday", label: "Birthdays" },
              ]}
            />
              </div>
            </div>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--accent)_28%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--accent)_4%,var(--bg-elevated))] px-6 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--partner-green)_16%,var(--bg-elevated))] text-[var(--success)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_70%,transparent)]">
              <Inbox className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="mt-5 font-display text-xl font-normal text-[var(--text-primary)]">
              Nothing to show right now
            </p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--text-secondary)]">
              {query.status === "completed"
                ? "No completed manual tasks for the current filters."
                : "No open tasks or reminders match these filters. Broaden home or type, or create a manual task."}
            </p>
          </div>
        ) : null}
        {tasks.length > 0
          ? tasks.map((task) => {
            if (task.kind === "payment_overdue") {
              return (
                <article
                  key={task.sourceId}
                  className={[
                    taskCardClass,
                    "border-[color-mix(in_srgb,var(--warning)_38%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--warning)_7%,var(--bg-elevated))]",
                  ].join(" ")}
                >
                  <div className="absolute inset-y-0 left-0 w-1 bg-[color-mix(in_srgb,var(--danger)_65%,var(--warning)_35%)]" />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex gap-3 pl-1">
                      <span
                        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--danger)_14%,var(--bg-elevated))] text-[var(--danger)]"
                        aria-hidden
                      >
                        <Wallet className="h-[1.15rem] w-[1.15rem]" strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {homePill(task.homeName)}
                        {typePill("Payment", "payment")}
                      </div>
                      <h3 className="mt-2 font-display text-[1.05rem] font-normal leading-snug tracking-tight text-[var(--text-primary)] sm:text-lg">
                        Overdue monthly charge — {task.residentName}
                      </h3>
                      <p className="mt-1.5 text-sm leading-snug text-[var(--text-secondary)]">
                        Billing month {task.billingMonth} · Unpaid amount{" "}
                        <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                          {formatMinorAsCurrency(
                            task.amountMinor,
                            task.currencyCode,
                          )}
                        </span>
                      </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 sm:pt-0.5">
                      <Link
                        className="village-btn-primary inline-flex min-h-10 w-full items-center justify-center no-underline sm:w-auto sm:min-w-[10.5rem]"
                        href={`/dashboard/homes/${task.homeId}/ledger?residentId=${encodeURIComponent(task.residentId)}`}
                      >
                        Open billing
                      </Link>
                    </div>
                  </div>
                </article>
              );
            }
            if (task.kind === "resident_birthday") {
              return (
                <article
                  key={task.sourceId}
                  className={taskCardClass}
                >
                  <div className="absolute inset-y-0 left-0 w-1 bg-[color-mix(in_srgb,var(--partner-green)_58%,var(--highlight)_42%)]" />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex gap-3 pl-1">
                      <span
                        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--highlight)_22%,var(--bg-elevated))] text-[var(--accent-strong)]"
                        aria-hidden
                      >
                        <Cake className="h-[1.15rem] w-[1.15rem]" strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {homePill(task.homeName)}
                        {typePill("Birthday", "birthday")}
                      </div>
                      <h3 className="mt-2 font-display text-[1.05rem] font-normal leading-snug tracking-tight text-[var(--text-primary)] sm:text-lg">
                        Resident birthday — {task.residentName}
                      </h3>
                      <p className="mt-1.5 text-sm leading-snug text-[var(--text-secondary)]">
                        Birthday date {task.birthdayDate}
                      </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 sm:pt-0.5">
                      <Link
                        className="village-btn-primary inline-flex min-h-10 w-full items-center justify-center no-underline sm:w-auto sm:min-w-[10.5rem]"
                        href={`/dashboard/homes/${task.homeId}/residents/${task.residentId}`}
                      >
                        Open resident
                      </Link>
                    </div>
                  </div>
                </article>
              );
            }
            const isEditing = editingId === task.id;
            const isBusy = busyId === task.id;
            return (
              <article
                key={task.id}
                className={taskCardClass}
              >
                <div
                  className={[
                    "absolute inset-y-0 left-0 w-1",
                    task.priority === "urgent"
                      ? "bg-[color-mix(in_srgb,var(--danger)_72%,var(--accent)_28%)]"
                      : "bg-[color-mix(in_srgb,var(--accent)_52%,var(--partner-green)_48%)]",
                  ].join(" ")}
                />
                {isEditing ? (
                  <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
                    <div className="flex flex-col gap-2">
                      <label className="village-label" htmlFor={`task-edit-home-${task.id}`}>
                        Home
                      </label>
                      <VillageSelect
                        id={`task-edit-home-${task.id}`}
                        className="w-full"
                        value={editDraft.homeId}
                        onChange={(v) =>
                          setEditDraft((draft) => ({
                            ...draft,
                            homeId: v,
                          }))
                        }
                        options={homes.map((home) => ({
                          value: home.id,
                          label: home.name,
                        }))}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-[1fr_11rem_9rem]">
                      <input
                        className={inputClass}
                        aria-label="Edit task title"
                        value={editDraft.title}
                        onChange={(e) =>
                          setEditDraft((draft) => ({
                            ...draft,
                            title: e.target.value,
                          }))
                        }
                      />
                      <input
                        className={inputClass}
                        aria-label="Edit task due date"
                        type="date"
                        value={editDraft.dueDate}
                        onChange={(e) =>
                          setEditDraft((draft) => ({
                            ...draft,
                            dueDate: e.target.value,
                          }))
                        }
                      />
                      <VillageSelect
                        ariaLabel="Edit task priority"
                        className="w-full"
                        value={editDraft.priority}
                        onChange={(v) =>
                          setEditDraft((draft) => ({
                            ...draft,
                            priority: v as TaskPriority,
                          }))
                        }
                        options={TASK_PRIORITY_OPTIONS}
                      />
                    </div>
                    <textarea
                      className={`${inputClass} min-h-28 resize-y lg:col-start-2`}
                      aria-label="Edit task notes"
                      value={editDraft.notes}
                      onChange={(e) =>
                        setEditDraft((draft) => ({ ...draft, notes: e.target.value }))
                      }
                    />
                    <div className="flex flex-wrap gap-2 lg:col-start-2">
                      <button
                        className="village-btn-primary min-h-10"
                        type="button"
                        disabled={isBusy || !editDraft.title.trim()}
                        onClick={() => void onSave(task.id)}
                      >
                        Save
                      </button>
                      <button
                        className="village-btn-secondary"
                        type="button"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex gap-3 pl-1">
                      <span
                        className={[
                          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          task.priority === "urgent"
                            ? "bg-[color-mix(in_srgb,var(--danger)_12%,var(--bg-elevated))] text-[var(--danger)]"
                            : "bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-elevated))] text-[var(--accent-strong)]",
                        ].join(" ")}
                        aria-hidden
                      >
                        <ClipboardList className="h-[1.15rem] w-[1.15rem]" strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {homePill(task.homeName || homeNameById.get(task.homeId) || "Home")}
                        {typePill(
                          task.priority,
                          task.priority === "urgent" ? "urgent" : "neutral",
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--bg-muted)_50%,var(--bg-elevated))] px-2.5 py-0.5 text-[0.8125rem] tabular-nums text-[var(--text-secondary)] ring-1 ring-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)]">
                          <CalendarClock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden strokeWidth={2} />
                          {dueLabel(task.dueDate)}
                        </span>
                      </div>
                      <h3 className="mt-2 font-display text-[1.05rem] font-normal leading-snug tracking-tight text-[var(--text-primary)] sm:text-lg">
                        {task.title}
                      </h3>
                      {task.notes ? (
                        <p className="mt-1.5 max-w-3xl text-sm leading-snug text-[var(--text-secondary)]">
                          {task.notes}
                        </p>
                      ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end sm:pt-0.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="village-btn-primary order-1 min-h-10 px-4"
                          type="button"
                          disabled={isBusy}
                          onClick={() => void onComplete(task.id)}
                        >
                          Complete
                        </button>
                        <button
                          className="village-btn-secondary order-2 min-h-10 px-4"
                          type="button"
                          onClick={() => {
                            setEditingId(task.id);
                            setEditDraft(draftFromTask(task));
                          }}
                        >
                          Edit
                        </button>
                      </div>
                      <button
                        className="text-[0.8125rem] font-semibold text-[var(--danger)] underline-offset-2 hover:underline disabled:opacity-50 sm:text-right"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void onDelete(task.id)}
                      >
                        Delete task
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
          : null}
      </section>

      {createModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss new manual task dialog"
                onClick={closeCreateTaskModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="tasks-create-modal-heading"
                data-testid="tasks-create-panel"
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
                              New manual task
                            </p>
                            <h2
                              id="tasks-create-modal-heading"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              Capture a home task
                            </h2>
                            <p className="text-sm leading-6 text-ink/65">
                              Shared with everyone who can access the selected home.
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                          <div className="rounded-2xl border border-pine/10 bg-cream/72 px-4 py-3 text-sm text-ink/65 shadow-sm">
                            <span className="font-semibold text-pine-2">
                              {homes.length}
                            </span>{" "}
                            accessible {homes.length === 1 ? "home" : "homes"}
                          </div>
                          <button
                            type="button"
                            className="rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5"
                            onClick={closeCreateTaskModal}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                    <form
                      className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(13rem,17rem)_1fr]"
                      onSubmit={onCreate}
                    >
                      <div className="flex flex-col gap-2">
                        <label htmlFor="task-home" className="village-label">
                          Home
                        </label>
                        <VillageSelect
                          id="task-home"
                          className="w-full"
                          value={createDraft.homeId}
                          onChange={(v) =>
                            setCreateDraft((draft) => ({
                              ...draft,
                              homeId: v,
                            }))
                          }
                          options={homes.map((home) => ({
                            value: home.id,
                            label: home.name,
                          }))}
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-[1fr_11rem_9rem]">
                        <div className="flex flex-col gap-2">
                          <label htmlFor="task-title" className="village-label">
                            Title
                          </label>
                          <input
                            id="task-title"
                            className={inputClass}
                            value={createDraft.title}
                            onChange={(e) =>
                              setCreateDraft((draft) => ({
                                ...draft,
                                title: e.target.value,
                              }))
                            }
                            placeholder="e.g. Follow up pharmacy order"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label htmlFor="task-due-date" className="village-label">
                            Due date
                          </label>
                          <input
                            id="task-due-date"
                            className={inputClass}
                            type="date"
                            value={createDraft.dueDate}
                            onChange={(e) =>
                              setCreateDraft((draft) => ({
                                ...draft,
                                dueDate: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label htmlFor="task-priority" className="village-label">
                            Priority
                          </label>
                          <VillageSelect
                            id="task-priority"
                            className="w-full"
                            value={createDraft.priority}
                            onChange={(v) =>
                              setCreateDraft((draft) => ({
                                ...draft,
                                priority: v as TaskPriority,
                              }))
                            }
                            options={TASK_PRIORITY_OPTIONS}
                          />
                        </div>
                      </div>
                      <div className="lg:col-start-2">
                        <label htmlFor="task-notes" className="village-label">
                          Notes
                        </label>
                        <textarea
                          id="task-notes"
                          className={`${inputClass} mt-2 min-h-28 resize-y`}
                          value={createDraft.notes}
                          onChange={(e) =>
                            setCreateDraft((draft) => ({
                              ...draft,
                              notes: e.target.value,
                            }))
                          }
                          placeholder="Optional details"
                        />
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:col-start-2">
                        <button
                          className="village-btn-primary min-h-10 px-5"
                          type="submit"
                          disabled={creating || !createDraft.title.trim()}
                        >
                          {creating ? "Creating..." : "Create task"}
                        </button>
                        {error ? (
                          <p className="text-sm font-medium text-[var(--danger)]">
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
