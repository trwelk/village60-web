import { getDb } from "@/db/client";
import { residentPublicProfileUrl } from "@/lib/appBaseUrl";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { renderResidentQrPng } from "@/lib/residentPublicProfile/qr";
import { getResident } from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

type RouteParams = {
  params: Promise<{ id: string; residentId: string }>;
};

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const resident = getResident(getDb(), actor, homeId, residentId);
    if (!resident.publicToken) {
      return new Response("Resident has no public token.", { status: 500 });
    }
    const url = residentPublicProfileUrl(resident.publicToken, req);
    const png = await renderResidentQrPng(url);
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="resident-${residentId}-qr.png"`,
      },
    });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}
