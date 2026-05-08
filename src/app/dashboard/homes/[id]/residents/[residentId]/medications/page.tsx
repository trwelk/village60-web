import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import { listResidentClinical } from "@/lib/residents/clinical";
import { getResident } from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AddMedicationModal } from "./AddMedicationModal";

type PageParams = {
  params: Promise<{ id: string; residentId: string }>;
};

function servingsLabel(servingsPerDay: number | null): string {
  if (servingsPerDay == null) {
    return "As directed";
  }
  return `${servingsPerDay} / day`;
}

export default async function ResidentMedicationsPage({ params }: PageParams) {
  const { id: homeId, residentId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }

  const actor = requireSessionActor(session);
  const db = getDb();
  const home = listHomes(db, actor).find((h) => h.id === homeId);
  if (!home) {
    notFound();
  }

  let medications: ReturnType<typeof listResidentClinical>["medications"] = [];
  try {
    getResident(db, actor, homeId, residentId);
    medications = listResidentClinical(db, actor, homeId, residentId).medications;
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  return (
    <main className="flex flex-col gap-8 text-ink">
      <section className="village-card village-reveal village-reveal-delay-1 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="village-section-title mb-0">All medications</h2>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <AddMedicationModal homeId={homeId} residentId={residentId} />
            <Link
              href={`/dashboard/homes/${homeId}/residents/${residentId}`}
              className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
            >
              Back to resident
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink/70">
            Showing {medications.length} of {medications.length}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled
              className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        <div className="village-table-wrap mt-5">
          <table className="village-table">
            <thead className="village-thead">
              <tr>
                <th className="village-th">Medication</th>
                <th className="village-th">Directions</th>
                <th className="village-th">Dose</th>
                <th className="village-th">Frequency</th>
                <th className="village-th">Status</th>
                <th className="village-th">Actions</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {medications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="village-td-muted py-10 text-center">
                    No medications assigned yet.
                  </td>
                </tr>
              ) : (
                medications.map((med) => (
                  <tr key={med.id}>
                    <td className="village-td font-medium">{med.name}</td>
                    <td className="village-td-muted max-w-[20rem] text-sm">
                      {med.directions}
                    </td>
                    <td className="village-td-muted">
                      {med.quantityPerServing} {med.unit}
                    </td>
                    <td className="village-td-muted">
                      {med.prn ? "PRN" : servingsLabel(med.servingsPerDay)}
                    </td>
                    <td className="village-td-muted capitalize">{med.status}</td>
                    <td className="village-td">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <button
                          type="button"
                          className="village-link cursor-pointer border-0 bg-transparent p-0"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4 hover:opacity-90"
                        >
                          Stop
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
