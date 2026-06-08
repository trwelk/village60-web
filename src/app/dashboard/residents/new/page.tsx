import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { Building2, ChevronRight } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

function homeAddressPreview(address: string | null | undefined): string | null {
  if (!address) return null;
  const line = address
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  return line ?? null;
}

function homeGridClass(count: number): string {
  if (count <= 1) return "grid gap-3";
  if (count === 2) return "grid gap-3 sm:grid-cols-2";
  return "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
}

export default async function NewResidentPickHomePage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const homes = listHomes(getDb(), actor);

  if (homes.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 text-ink">
        <nav
          aria-label="Breadcrumb"
          className="village-reveal flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]"
        >
          <Link
            href="/dashboard/residents"
            className="font-semibold text-[var(--highlight)] underline decoration-[color:color-mix(in_srgb,var(--highlight)_35%,transparent)] underline-offset-[3px] transition hover:decoration-[color:color-mix(in_srgb,var(--highlight)_62%,transparent)]"
          >
            Residents
          </Link>
          <span className="text-[var(--text-muted)]" aria-hidden>
            /
          </span>
          <span className="font-medium text-[var(--text-primary)]">
            Add resident
          </span>
        </nav>

        <section className="village-card village-reveal village-reveal-delay-1 overflow-hidden p-0">
          <div className="relative overflow-hidden border-b border-[color:color-mix(in_srgb,var(--accent)_18%,var(--line-subtle))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_12%,var(--bg-elevated)),var(--bg-elevated)_52%,color-mix(in_srgb,var(--accent)_6%,var(--bg-elevated)))] px-6 py-8 sm:px-8">
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_55%)]"
            />
            <p className="village-kicker relative">New admission</p>
            <h1 className="relative mt-2 font-display text-3xl font-normal tracking-[-0.04em] text-[var(--text-primary)] sm:text-[2rem]">
              Add resident
            </h1>
            <p className="relative mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
              You do not have access to any homes, so a new resident cannot be
              created from here.
            </p>
          </div>
          <div className="border-t border-[color:color-mix(in_srgb,var(--line-subtle)_78%,transparent)] px-6 py-4 sm:px-8">
            <Link href="/dashboard/residents" className="village-link-subtle">
              Back to residents
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (homes.length === 1) {
    redirect(`/dashboard/homes/${homes[0].id}/residents/new`);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 text-ink">
      <nav
        aria-label="Breadcrumb"
        className="village-reveal flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]"
      >
        <Link
          href="/dashboard/residents"
          className="font-semibold text-[var(--highlight)] underline decoration-[color:color-mix(in_srgb,var(--highlight)_35%,transparent)] underline-offset-[3px] transition hover:decoration-[color:color-mix(in_srgb,var(--highlight)_62%,transparent)]"
        >
          Residents
        </Link>
        <span className="text-[var(--text-muted)]" aria-hidden>
          /
        </span>
        <span className="font-medium text-[var(--text-primary)]">
          Add resident
        </span>
      </nav>

      <section className="village-card village-reveal village-reveal-delay-1 overflow-hidden p-0">
        <div className="relative overflow-hidden border-b border-[color:color-mix(in_srgb,var(--accent)_18%,var(--line-subtle))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_12%,var(--bg-elevated)),var(--bg-elevated)_52%,color-mix(in_srgb,var(--accent)_6%,var(--bg-elevated)))] px-6 py-8 sm:px-8">
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_55%)]"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="village-kicker">New admission</p>
              <h1 className="mt-2 font-display text-3xl font-normal tracking-[-0.04em] text-[var(--text-primary)] sm:text-[2rem]">
                Choose a home
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
                Select where this resident will live. You&apos;ll complete their
                profile on the next step.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full border border-[color:color-mix(in_srgb,var(--accent)_24%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--bg-elevated))] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
              Step 1 of 2
            </span>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <p className="village-field-label mb-3">Retirement home</p>
          <ul className={homeGridClass(homes.length)}>
            {homes.map((home) => {
              const addressPreview = homeAddressPreview(home.address);
              return (
                <li key={home.id}>
                  <Link
                    href={`/dashboard/homes/${home.id}/residents/new`}
                    className="group village-lift flex h-full items-start gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--accent)_16%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] px-4 py-4 no-underline transition duration-200 sm:px-5"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--bg-elevated))] text-[var(--accent-strong)] transition group-hover:bg-[color:color-mix(in_srgb,var(--accent)_20%,var(--bg-elevated))]"
                      aria-hidden
                    >
                      <Building2 className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5">
                      <span className="block text-base font-semibold text-[var(--text-primary)] transition group-hover:text-[var(--accent-strong)]">
                        {home.name}
                      </span>
                      {addressPreview ? (
                        <span className="mt-1 block text-sm leading-snug text-[var(--text-secondary)]">
                          {addressPreview}
                        </span>
                      ) : (
                        <span className="mt-1 block text-sm text-[var(--text-muted)]">
                          Continue to resident details
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                      aria-hidden
                      strokeWidth={2}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-[color:color-mix(in_srgb,var(--line-subtle)_78%,transparent)] px-6 py-4 sm:px-8">
          <Link href="/dashboard/residents" className="village-link-subtle">
            Cancel and return to residents
          </Link>
        </div>
      </section>
    </div>
  );
}
