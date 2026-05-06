import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GlobalResidentMedicationsClient } from "./GlobalResidentMedicationsClient";

type PageParams = {
  searchParams?: Promise<{ homeId?: string; residentId?: string }>;
};

export default async function ResidentMedicationsPage({ searchParams }: PageParams) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const db = getDb();
  const homesList = listHomes(db, actor);
  const homeOptions = homesList.map((h) => ({
    homeId: h.id,
    homeName: h.name,
  }));

  const q = searchParams ? await searchParams : {};
  let selectedHomeId = typeof q.homeId === "string" ? q.homeId : "";
  if (selectedHomeId && !homeOptions.some((h) => h.homeId === selectedHomeId)) {
    selectedHomeId = "";
  }
  if (!selectedHomeId && homeOptions.length > 0) {
    selectedHomeId = homeOptions[0].homeId;
  }

  const selectedResidentId = typeof q.residentId === "string" ? q.residentId : "";

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <div className="village-reveal relative isolate rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] px-5 py-6 shadow-[0_22px_60px_-36px_color-mix(in_srgb,var(--accent)_42%,transparent)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-1/2 rounded-r-3xl bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_24%,transparent),transparent_46%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--highlight)_20%,transparent),transparent_42%)]" />
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--accent-strong)]">
            Clinical
          </p>
          <h1 className="village-page-title text-4xl">Resident medications</h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            View and manage prescribed medications and administration records for individual residents.
          </p>
        </div>
      </div>
      <GlobalResidentMedicationsClient
        homes={homeOptions}
        selectedHomeId={selectedHomeId}
        selectedResidentId={selectedResidentId}
      />
    </main>
  );
}
