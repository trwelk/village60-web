"use client";

import type { ExpenseTypeDto } from "@/lib/expenseTypes/service";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ExpenseTypesAdminUIProps = {
  initialExpenseTypes: ExpenseTypeDto[];
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

const createdFmt = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function ExpenseTypesAdminUI({
  initialExpenseTypes,
}: ExpenseTypesAdminUIProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Expense types
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Global labels for home operating expenses (food, utilities, and so
          on). Names cannot be changed after creation; you can delete a type
          only while it is unused.
        </p>
        <Link
          href="/dashboard/expenses"
          className="text-sm font-medium text-[var(--highlight)] underline decoration-[color:color-mix(in_srgb,var(--highlight)_35%,transparent)] underline-offset-[3px]"
        >
          Open home expenses ledger
        </Link>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-[color-mix(in_srgb,#b91c1c_35%,transparent)] bg-[color-mix(in_srgb,#fecaca_22%,transparent)] px-4 py-3 text-sm text-[var(--text-primary)]"
        >
          {error}
        </div>
      ) : null}

      <section
        aria-labelledby="add-type-heading"
        className="rounded-xl border border-[color-mix(in_srgb,var(--line-subtle)_85%,transparent)] bg-[var(--bg-elevated)] p-5 shadow-[0_1px_0_color-mix(in_srgb,var(--line-subtle)_55%,transparent)]"
      >
        <h2
          id="add-type-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]"
        >
          Add type
        </h2>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setCreatePending(true);
            try {
              const res = await fetch("/api/expense-types", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
              });
              if (!res.ok) {
                setError(await parseError(res));
                return;
              }
              setName("");
              router.refresh();
            } finally {
              setCreatePending(false);
            }
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-[var(--text-secondary)]">
              Name
            </span>
            <input
              className="rounded-lg border border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] bg-[var(--bg-muted)] px-3 py-2 text-[var(--text-primary)] outline-none ring-[var(--focus-ring)] focus-visible:ring-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              aria-required
              disabled={createPending}
              placeholder="e.g. Electricity"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] px-5 text-sm font-semibold text-[var(--bg-elevated)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={createPending || !name.trim()}
          >
            {createPending ? "Saving…" : "Create type"}
          </button>
        </form>
      </section>

      <section aria-labelledby="types-table-heading">
        <h2
          id="types-table-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]"
        >
          All types
        </h2>
        {initialExpenseTypes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[color-mix(in_srgb,var(--line-subtle)_70%,transparent)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
            No expense types yet. Add one above to use on the expenses ledger
            (when available).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[color-mix(in_srgb,var(--line-subtle)_85%,transparent)] bg-[var(--bg-elevated)]">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_55%,transparent)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                    Created (UTC)
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialExpenseTypes.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[color-mix(in_srgb,var(--line-subtle)_55%,transparent)] last:border-b-0"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {row.name}
                    </td>
                    <td className="hidden px-4 py-3 text-[var(--text-secondary)] sm:table-cell">
                      {createdFmt.format(row.createdAtUtcMs)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-sm font-semibold text-[#b91c1c] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={deletingId !== null}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Delete expense type “${row.name}”? You can only delete types that are not used on any expense.`,
                            )
                          ) {
                            return;
                          }
                          setError(null);
                          setDeletingId(row.id);
                          try {
                            const res = await fetch(
                              `/api/expense-types/${encodeURIComponent(row.id)}`,
                              { method: "DELETE" },
                            );
                            if (!res.ok) {
                              setError(await parseError(res));
                              return;
                            }
                            router.refresh();
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                      >
                        {deletingId === row.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
