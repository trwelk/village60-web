import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { createWard, listWardsForHome } from "@/lib/wards/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const wards = listWardsForHome(
      getDb(),
      requireSessionActor(session),
      homeId,
    );
    return NextResponse.json({ wards });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
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
  const label =
    "label" in rec && typeof rec.label === "string" ? rec.label : "";
  if (!label.trim()) {
    return NextResponse.json({ error: "label is required." }, { status: 400 });
  }
  let sortOrder: number | null | undefined;
  if ("sortOrder" in rec) {
    if (rec.sortOrder === null) {
      sortOrder = null;
    } else if (typeof rec.sortOrder === "number" && Number.isFinite(rec.sortOrder)) {
      sortOrder = rec.sortOrder;
    } else {
      return NextResponse.json(
        { error: "sortOrder must be a finite number or null." },
        { status: 400 },
      );
    }
  }

  let bedCount: number | null | undefined;
  if ("bedCount" in rec) {
    if (rec.bedCount === null) {
      bedCount = null;
    } else if (
      typeof rec.bedCount === "number" &&
      Number.isFinite(rec.bedCount) &&
      Number.isInteger(rec.bedCount) &&
      rec.bedCount >= 0
    ) {
      bedCount = rec.bedCount;
    } else {
      return NextResponse.json(
        { error: "bedCount must be a non-negative integer or null." },
        { status: 400 },
      );
    }
  }

  let monthlyRatePerPersonMinor: number | null | undefined;
  if ("monthlyRatePerPersonMinor" in rec) {
    if (rec.monthlyRatePerPersonMinor === null) {
      monthlyRatePerPersonMinor = null;
    } else if (
      typeof rec.monthlyRatePerPersonMinor === "number" &&
      Number.isFinite(rec.monthlyRatePerPersonMinor) &&
      Number.isInteger(rec.monthlyRatePerPersonMinor) &&
      rec.monthlyRatePerPersonMinor >= 0
    ) {
      monthlyRatePerPersonMinor = rec.monthlyRatePerPersonMinor;
    } else {
      return NextResponse.json(
        {
          error:
            "monthlyRatePerPersonMinor must be a non-negative integer or null.",
        },
        { status: 400 },
      );
    }
  }

  try {
    const ward = createWard(getDb(), requireSessionActor(session), homeId, {
      label,
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(bedCount !== undefined ? { bedCount } : {}),
      ...(monthlyRatePerPersonMinor !== undefined
        ? { monthlyRatePerPersonMinor }
        : {}),
    });
    return NextResponse.json({ ward });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
