import { getDb } from "@/db/client";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { updateOwnPassword } from "@/lib/users/service";
import { usersErrorResponse } from "@/lib/users/http";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
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
  const currentPassword =
    typeof b.currentPassword === "string" ? b.currentPassword : "";
  const newPassword = typeof b.newPassword === "string" ? b.newPassword : "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "currentPassword and newPassword are required." },
      { status: 400 },
    );
  }

  try {
    await updateOwnPassword(
      getDb(),
      session.userId,
      currentPassword,
      newPassword,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = usersErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
