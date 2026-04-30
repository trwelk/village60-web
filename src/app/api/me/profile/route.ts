import { getDb } from "@/db/client";
import { getOwnProfile, updateOwnProfile } from "@/lib/users/service";
import { usersErrorResponse } from "@/lib/users/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const profile = getOwnProfile(getDb(), session.userId);
  if (!profile) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(profile);
}

export async function PATCH(req: Request) {
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
  if ("displayName" in b) {
    const v = b.displayName;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json(
        { error: "displayName must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("phone" in b) {
    const v = b.phone;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json(
        { error: "phone must be a string or null." },
        { status: 400 },
      );
    }
  }
  const patch: {
    displayName?: string | null;
    phone?: string | null;
  } = {};
  if ("displayName" in b) {
    patch.displayName = b.displayName as string | null;
  }
  if ("phone" in b) {
    patch.phone = b.phone as string | null;
  }
  try {
    const profile = updateOwnProfile(getDb(), session.userId, patch);
    return NextResponse.json(profile);
  } catch (e) {
    const resp = usersErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
