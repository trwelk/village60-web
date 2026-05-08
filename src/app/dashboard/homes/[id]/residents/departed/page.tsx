import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { getAppTimezone } from "@/lib/config/appTimezone";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import {
  listDepartedResidentsForHome,
  residentViewForActor,
  type ResidentPublic,
} from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PageParams = { params: Promise<{ id: string }> };

const REASON_PREVIEW_CHARS = 120;

function formatDepartureLocal(utcMs: number): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: getAppTimezone(),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(utcMs));
}

function DepartedRow({
  homeId,
  r,
}: {
  homeId: string;
  r: ResidentPublic;
}) {
  const reason = r.departureReason ?? "—";
  const truncated =
    reason.length > REASON_PREVIEW_CHARS
      ? `${reason.slice(0, REASON_PREVIEW_CHARS)}…`
      : reason;
  const at = r.departureAtUtcMs;
  return (
    <tr>
      <td className="village-td font-medium">
        <Link
          href={`/dashboard/homes/${homeId}/residents/${r.id}`}
          className="village-link"
        >
          {r.fullName}
        </Link>
      </td>
      <td className="village-td-muted">
        {at != null ? formatDepartureLocal(at) : "—"}
      </td>
      <td className="village-td-muted max-w-md">
        <span title={reason.length > REASON_PREVIEW_CHARS ? reason : undefined}>
          {truncated}
        </span>
      </td>
    </tr>
  );
}

export default async function DepartedResidentsPage({ params }: PageParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const homes = listHomes(getDb(), actor);
  const home = homes.find((h) => h.id === homeId);
  if (!home) {
    notFound();
  }

  let residents: ResidentPublic[];
  try {
    residents = listDepartedResidentsForHome(getDb(), actor, homeId).map((row) =>
      residentViewForActor(actor, row),
    );
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  return (
    <main className="flex flex-col gap-8 text-ink">
      <p className="text-sm text-ink/70">
        <Link href={`/dashboard/homes/${homeId}/residents`} className="village-link">
          ← Active residents
        </Link>
      </p>

      <section>
        <h2 className="village-section-title">Directory</h2>
        <div className="village-table-wrap mt-4">
          <table className="village-table">
            <thead className="village-thead">
              <tr>
                <th className="village-th">Name</th>
                <th className="village-th">Departure</th>
                <th className="village-th">Reason</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {residents.length === 0 ? (
                <tr>
                  <td colSpan={3} className="village-td-muted py-10 text-center">
                    No departed residents for this home yet.
                  </td>
                </tr>
              ) : (
                residents.map((r) => (
                  <DepartedRow key={r.id} homeId={homeId} r={r} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
