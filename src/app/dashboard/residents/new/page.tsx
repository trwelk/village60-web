import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError } from "@/lib/homes/errors";
import { resolveSelectedHomeId } from "@/lib/dashboard/resolveSelectedHomeId";
import { listHomes } from "@/lib/homes/service";
import {
  countActiveResidentsByWardId,
  isWardAtCapacity,
  listWardsForHome,
} from "@/lib/wards/service";
import { listCareStaffForHome } from "@/lib/users/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ResidentEditor } from "@/app/dashboard/homes/[id]/residents/ResidentEditor";
import { NewResidentHomePicker } from "./NewResidentHomePicker";

type PageParams = {
  searchParams: Promise<{ homeId?: string }>;
};

export default async function NewResidentPage({ searchParams }: PageParams) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const db = getDb();
  const homes = listHomes(db, actor);

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

  const sp = await searchParams;
  const selectedHomeId = resolveSelectedHomeId(sp.homeId, homes);
  const home = homes.find((h) => h.id === selectedHomeId);
  if (!home) {
    notFound();
  }

  let wards;
  let careStaffOptions;
  try {
    wards = listWardsForHome(db, actor, selectedHomeId);
    careStaffOptions = listCareStaffForHome(db, actor, selectedHomeId);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      notFound();
    }
    throw e;
  }

  const occupiedByWard = countActiveResidentsByWardId(db, selectedHomeId);

  return (
    <div className="flex flex-col gap-6 text-ink">
      <Suspense fallback={null}>
        <NewResidentHomePicker
          homes={homes.map((h) => ({ id: h.id, name: h.name }))}
          selectedHomeId={selectedHomeId}
          homeName={home.name}
        >
          <ResidentEditor
            mode="create"
            homeId={selectedHomeId}
            homeName={home.name}
            wards={wards.map((w) => ({
              id: w.id,
              label: w.label,
              isFull: isWardAtCapacity(w.bedCount, occupiedByWard.get(w.id) ?? 0),
            }))}
            careStaffOptions={careStaffOptions}
          />
        </NewResidentHomePicker>
      </Suspense>
    </div>
  );
}
