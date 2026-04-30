import { getDb } from "@/db/client";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { resetUserPassword } from "@/lib/users/service";
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
  const newPassword =
    typeof b.newPassword === "string" ? b.newPassword : "";

  if (!newPassword) {
    return NextResponse.json(
      { error: "newPassword is required." },
      { status: 400 },
    );
  }

  try {
    await resetUserPassword(getDb(), session.role, id, newPassword);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = usersErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
