import { getDb } from "@/db/client";
import { parseBillingMonth } from "@/lib/billing/billingMonth";
import { listResidentOtherCharges } from "@/lib/billing/otherCharges";
import {
  getResidentMonthlyChargesListMeta,
  listResidentMonthlyCharges,
} from "@/lib/billing/residentCharges";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; residentId: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("billingMonthFrom");
  const toRaw = url.searchParams.get("billingMonthTo");
  try {
    const billingMonthFrom =
      fromRaw !== null && fromRaw !== ""
        ? parseBillingMonth(fromRaw)
        : undefined;
    const billingMonthTo =
      toRaw !== null && toRaw !== "" ? parseBillingMonth(toRaw) : undefined;
    const actor = requireSessionActor(session);
    const db = getDb();
    const charges = listResidentMonthlyCharges(
      db,
      actor,
      homeId,
      residentId,
      {
        ...(billingMonthFrom !== undefined ? { billingMonthFrom } : {}),
        ...(billingMonthTo !== undefined ? { billingMonthTo } : {}),
      },
    );
    const otherCharges = listResidentOtherCharges(
      db,
      actor,
      homeId,
      residentId,
    );
    const meta = getResidentMonthlyChargesListMeta(
      db,
      actor,
      homeId,
      residentId,
    );
    return NextResponse.json({ charges, otherCharges, ...meta });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}
