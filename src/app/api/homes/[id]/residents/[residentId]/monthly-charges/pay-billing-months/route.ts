import { getDb } from "@/db/client";
import { payBillingMonthsForResident } from "@/lib/billing/residentCharges";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ id: string; residentId: string }>;
};

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
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
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;
  if (!Array.isArray(rec.billingMonths)) {
    return NextResponse.json(
      { error: "billingMonths must be an array of strings." },
      { status: 400 },
    );
  }
  const billingMonths = rec.billingMonths.filter(
    (x): x is string => typeof x === "string",
  );
  if (billingMonths.length !== rec.billingMonths.length) {
    return NextResponse.json(
      { error: "billingMonths must be an array of strings." },
      { status: 400 },
    );
  }

  let paidOn: string | undefined;
  if ("paidOn" in rec) {
    if (rec.paidOn === null || rec.paidOn === undefined) {
      paidOn = undefined;
    } else if (typeof rec.paidOn === "string") {
      paidOn = rec.paidOn;
    } else {
      return NextResponse.json(
        { error: "paidOn must be a string, null, or omitted." },
        { status: 400 },
      );
    }
  }

  let notes: string | null | undefined;
  if ("notes" in rec) {
    if (rec.notes === null) {
      notes = null;
    } else if (typeof rec.notes === "string") {
      notes = rec.notes;
    } else {
      return NextResponse.json(
        { error: "notes must be a string or null." },
        { status: 400 },
      );
    }
  }

  try {
    const charges = payBillingMonthsForResident(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      {
        billingMonths,
        ...(paidOn !== undefined ? { paidOn } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    );
    return NextResponse.json({ charges });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}
