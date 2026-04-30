import { getDb } from "@/db/client";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { setCareUserHomeAssignments } from "@/lib/users/service";
import { usersErrorResponse } from "@/lib/users/http";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id } = await ctx.params;
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
  const primaryHomeId =
    typeof b.primaryHomeId === "string" ? b.primaryHomeId : "";
  const additionalHomeIds = Array.isArray(b.additionalHomeIds)
    ? b.additionalHomeIds.filter((x): x is string => typeof x === "string")
    : [];

  if (!primaryHomeId.trim()) {
    return NextResponse.json(
      { error: "primaryHomeId is required." },
      { status: 400 },
    );
  }

  try {
    const user = setCareUserHomeAssignments(getDb(), session.role, id, {
      primaryHomeId,
      additionalHomeIds,
    });
    return NextResponse.json({ user });
  } catch (e) {
    const resp = usersErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
