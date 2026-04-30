import { getDb } from "@/db/client";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { createUser, listUsersWithAssignments } from "@/lib/users/service";
import { usersErrorResponse } from "@/lib/users/http";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SessionUserRole } from "@/lib/session";

export async function GET() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const users = listUsersWithAssignments(getDb(), session.role);
    return NextResponse.json({ users });
  } catch (e) {
    const resp = usersErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(req: Request) {
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
  const email = typeof b.email === "string" ? b.email : "";
  const password = typeof b.password === "string" ? b.password : "";
  const roleRaw = typeof b.role === "string" ? b.role : "";
  const role =
    roleRaw === "admin" || roleRaw === "care"
      ? (roleRaw as SessionUserRole)
      : null;
  const primaryHomeId =
    typeof b.primaryHomeId === "string" ? b.primaryHomeId : undefined;
  const additionalHomeIds = Array.isArray(b.additionalHomeIds)
    ? b.additionalHomeIds.filter((x): x is string => typeof x === "string")
    : undefined;

  if (!email.trim() || !password || !role) {
    return NextResponse.json(
      { error: "email, password, and role (admin or care) are required." },
      { status: 400 },
    );
  }

  try {
    const user = await createUser(getDb(), session.role, {
      email,
      password,
      role,
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
