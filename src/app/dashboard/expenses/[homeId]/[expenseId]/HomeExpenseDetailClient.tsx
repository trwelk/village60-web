"use client";

import type { HomeExpenseDto } from "@/lib/homeExpenses/service";
import type { ExpenseTypeDto } from "@/lib/expenseTypes/service";
import type { HomeExpenseLedgerRow } from "@/lib/homeExpenses/ledgerShared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ExpenseForm, ExpenseModalShell } from "../../ExpenseEditorDialog";

type AttachmentRow = {
  id: string;
  originalFilename: string;
  sizeBytes: number;
};

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

function formatAttachmentSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatTs(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function DetailAttachments({
  homeId,
  expenseId,
}: {
  homeId: string;
  expenseId: string;
}) {
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/homes/${encodeURIComponent(homeId)}/expenses/${encodeURIComponent(expenseId)}/attachments`,
        );
        const j = (await res.json().catch(() => null)) as {
          attachments?: AttachmentRow[];
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(j?.error ?? "Failed to load attachments.");
        }
        if (!cancelled) {
          setRows(j?.attachments ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load attachments.");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeId, expenseId]);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-pine/14 bg-[linear-gradient(165deg,rgba(250,247,241,0.92)_0%,rgba(255,255,255,0.55)_48%,rgba(26,77,58,0.04)_100%)] p-5 shadow-[0_20px_50px_-38px_rgba(26,77,58,0.45)] sm:p-6">
      <div
        className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_68%)]"
        aria-hidden
      />
      <h2 className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-terracotta">
        Receipts &amp; files
      </h2>
      {loading ? (
        <p className="mt-3 text-sm text-ink/55">Loading attachments…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink/55">
          No files yet. Edit this expense to upload PDF or image receipts.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pine/12 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-sm"
            >
              <a
                href={`/api/homes/${encodeURIComponent(homeId)}/expenses/${encodeURIComponent(expenseId)}/attachments/${encodeURIComponent(r.id)}`}
                className="min-w-0 flex-1 font-medium text-[var(--highlight)] underline decoration-[color:color-mix(in_srgb,var(--highlight)_38%,transparent)] underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                {r.originalFilename}
              </a>
              <span className="shrink-0 text-xs tabular-nums text-ink/45">
                {formatAttachmentSize(r.sizeBytes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Props = {
  expense: HomeExpenseLedgerRow;
  homeId: string;
  homeName: string;
  currencyCode: string;
  expenseTypes: ExpenseTypeDto[];
  backHref: string;
};

export function HomeExpenseDetailClient({
  expense: initialExpense,
  homeId,
  homeName,
  currencyCode,
  expenseTypes,
  backHref,
}: Props) {
  const router = useRouter();
  const [expense, setExpense] = useState(initialExpense);
  const [editOpen, setEditOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setExpense(initialExpense);
  }, [initialExpense]);

  async function submitPatch(body: Record<string, unknown>) {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(
        `/api/homes/${encodeURIComponent(homeId)}/expenses/${encodeURIComponent(expense.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? (await res.text()));
      }
      const j = (await res.json()) as { expense?: HomeExpenseDto };
      const dto = j.expense;
      if (dto) {
        setExpense((prev) => ({
          ...prev,
          expenseTypeId: dto.expenseTypeId,
          expenseTypeName:
            expenseTypes.find((t) => t.id === dto.expenseTypeId)?.name ??
            prev.expenseTypeName,
          amountMinor: dto.amountMinor,
          incurredOn: dto.incurredOn,
          paidOn: dto.paidOn,
          vendor: dto.vendor,
          invoiceReference: dto.invoiceReference,
          note: dto.note,
          createdAtUtcMs: dto.createdAtUtcMs,
          updatedAtUtcMs: dto.updatedAtUtcMs,
        }));
      }
      setEditOpen(false);
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const paid = Boolean(expense.paidOn);

  const detailRows: { label: string; value: ReactNode }[] = [
    { label: "Incurred on", value: expense.incurredOn },
    {
      label: "Paid on",
      value: expense.paidOn ?? (
        <span className="text-ink/50">Not marked paid</span>
      ),
    },
    { label: "Expense type", value: expense.expenseTypeName },
    {
      label: "Vendor",
      value: expense.vendor?.trim() ? expense.vendor : "—",
    },
    {
      label: "Invoice / reference",
      value: expense.invoiceReference?.trim() ? expense.invoiceReference : "—",
    },
    {
      label: "Note",
      value:
        expense.note?.trim() ? (
          <span className="whitespace-pre-wrap">{expense.note}</span>
        ) : (
          "—"
        ),
    },
    { label: "Record created", value: formatTs(expense.createdAtUtcMs) },
    { label: "Last updated", value: formatTs(expense.updatedAtUtcMs) },
  ];

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-6">
          <article className="relative isolate overflow-hidden rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_93%,transparent)] shadow-[0_28px_70px_-40px_color-mix(in_srgb,var(--accent)_38%,transparent)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_srgb,var(--highlight)_14%,transparent),transparent_52%),radial-gradient(90%_70%_at_100%_100%,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_55%)]" />
            <div className="relative border-b border-pine/10 px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-terracotta">
                    Home operating expense
                  </p>
                  <p className="mt-2 text-sm font-medium text-ink/60">{homeName}</p>
                  <h1 className="mt-1 font-mono text-sm tracking-tight text-pine-2/80">
                    {expense.id}
                  </h1>
                </div>
                <span
                  className={
                    paid
                      ? "rounded-full border border-pine/25 bg-pine/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-pine-2"
                      : "rounded-full border border-terracotta/28 bg-terracotta/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-terracotta"
                  }
                >
                  {paid ? "Paid" : "Unpaid"}
                </span>
              </div>
              <p className="mt-8 font-display text-4xl font-semibold tracking-tight text-pine-2 sm:text-5xl">
                {formatMinorAsCurrency(expense.amountMinor, currencyCode)}
              </p>
              <p className="mt-2 text-sm text-ink/55">
                Denominated in {currencyCode}. Village cost ledger (not a resident
                charge).
              </p>
            </div>
            <dl className="relative grid gap-0 sm:grid-cols-2">
              {detailRows.map((row, i) => (
                <div
                  key={row.label}
                  className={`border-t border-pine/10 px-6 py-4 sm:px-8 ${
                    i % 2 === 1 ? "sm:border-l sm:border-pine/10" : ""
                  }`}
                >
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink/40">
                    {row.label}
                  </dt>
                  <dd className="mt-1.5 text-[var(--text-primary)]">{row.value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <DetailAttachments homeId={homeId} expenseId={expense.id} />
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-3 lg:max-w-[14rem]">
          <Link
            href={backHref}
            className="village-btn village-btn-secondary inline-flex justify-center no-underline"
          >
            ← Back to ledger
          </Link>
          <button
            type="button"
            className="village-btn village-btn-primary shadow-[0_14px_36px_-22px_color-mix(in_srgb,var(--accent)_55%,transparent)]"
            onClick={() => {
              setFormError(null);
              setEditOpen(true);
            }}
          >
            Edit expense
          </button>
        </aside>
      </div>

      {editOpen ? (
        <ExpenseModalShell
          mode="edit"
          currencyCode={currencyCode}
          closeDisabled={saving}
          onClose={() => !saving && setEditOpen(false)}
        >
          <ExpenseForm
            key={expense.id}
            homeId={homeId}
            expenseId={expense.id}
            expenseTypes={expenseTypes}
            defaultCurrencyCode={currencyCode}
            initial={expense}
            disabled={expenseTypes.length === 0}
            error={formError}
            submitting={saving}
            onAttachmentsChanged={() => router.refresh()}
            onSubmit={(payload: Record<string, unknown>) => void submitPatch(payload)}
          />
        </ExpenseModalShell>
      ) : null}
    </>
  );
}
