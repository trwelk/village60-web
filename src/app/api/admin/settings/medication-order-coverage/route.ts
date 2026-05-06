import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { medicationOrderSettingsErrorResponse } from "@/lib/medicationOrderSettings/http";
import {
  getMedicationOrderCoverageMonthsForAdmin,
  setMedicationOrderCoverageMonthsForAdmin,
} from "@/lib/medicationOrderSettings/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const medicationOrderCoverageMonths = getMedicationOrderCoverageMonthsForAdmin(
      getDb(),
      actor,
    );
    return NextResponse.json({ medicationOrderCoverageMonths });
  } catch (e) {
    const resp = medicationOrderSettingsErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

export async function PATCH(req: Request) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const raw = b.medicationOrderCoverageMonths;
  try {
    const actor = requireSessionActor(session);
    const medicationOrderCoverageMonths = setMedicationOrderCoverageMonthsForAdmin(
      getDb(),
      actor,
      raw,
      Date.now(),
    );
    return NextResponse.json({ medicationOrderCoverageMonths });
  } catch (e) {
    const resp = medicationOrderSettingsErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}
