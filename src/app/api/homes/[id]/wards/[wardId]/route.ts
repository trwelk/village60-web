import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { updateWard } from "@/lib/wards/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; wardId: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: homeId, wardId } = await params;
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
  const input: {
    label?: string;
    sortOrder?: number | null;
    bedCount?: number | null;
    monthlyRatePerPersonMinor?: number | null;
    archived?: boolean;
  } = {};

  if ("label" in rec) {
    if (typeof rec.label !== "string") {
      return NextResponse.json({ error: "label must be a string." }, { status: 400 });
    }
    input.label = rec.label;
  }
  if ("sortOrder" in rec) {
    if (rec.sortOrder === null) {
      input.sortOrder = null;
    } else if (typeof rec.sortOrder === "number" && Number.isFinite(rec.sortOrder)) {
      input.sortOrder = rec.sortOrder;
    } else {
      return NextResponse.json(
        { error: "sortOrder must be a finite number or null." },
        { status: 400 },
      );
    }
  }
  if ("bedCount" in rec) {
    if (rec.bedCount === null) {
      input.bedCount = null;
    } else if (
      typeof rec.bedCount === "number" &&
      Number.isFinite(rec.bedCount) &&
      Number.isInteger(rec.bedCount) &&
      rec.bedCount >= 0
    ) {
      input.bedCount = rec.bedCount;
    } else {
      return NextResponse.json(
        { error: "bedCount must be a non-negative integer or null." },
        { status: 400 },
      );
    }
  }
  if ("monthlyRatePerPersonMinor" in rec) {
    if (rec.monthlyRatePerPersonMinor === null) {
      input.monthlyRatePerPersonMinor = null;
    } else if (
      typeof rec.monthlyRatePerPersonMinor === "number" &&
      Number.isFinite(rec.monthlyRatePerPersonMinor) &&
      Number.isInteger(rec.monthlyRatePerPersonMinor) &&
      rec.monthlyRatePerPersonMinor >= 0
    ) {
      input.monthlyRatePerPersonMinor = rec.monthlyRatePerPersonMinor;
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
  if ("archived" in rec) {
    if (typeof rec.archived !== "boolean") {
      return NextResponse.json(
        { error: "archived must be a boolean." },
        { status: 400 },
      );
    }
    input.archived = rec.archived;
  }

  if (
    input.label === undefined &&
    input.sortOrder === undefined &&
    input.bedCount === undefined &&
    input.monthlyRatePerPersonMinor === undefined &&
    input.archived === undefined
  ) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  try {
    const ward = updateWard(
      getDb(),
      requireSessionActor(session),
      homeId,
      wardId,
      input,
    );
    return NextResponse.json({ ward });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
