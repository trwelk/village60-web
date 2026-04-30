import { authEvents, users } from "@/db/schema";
import { getDb } from "@/db/client";
import { lockoutStateFromRow } from "@/lib/auth/lockoutDb";
import {
  applyFailedLoginAttempt,
  clearAfterSuccessfulLogin,
  defaultLockoutConfig,
  isLoginAllowed,
} from "@/lib/iam/lockout";
import { verifyPassword } from "@/lib/iam/password";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const emailRaw =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
  const password =
    typeof body === "object" &&
    body !== null &&
    "password" in body &&
    typeof (body as { password: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";

  if (!emailRaw || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const db = getDb();
  const row = db.select().from(users).where(eq(users.email, emailRaw)).get();

  const recordFailedSignIn = (userId: string | null) => {
    db.insert(authEvents)
      .values({
        id: randomUUID(),
        userId,
        email: emailRaw,
        eventType: "sign_in_failed",
        occurredAtUtcMs: Date.now(),
      })
      .run();
  };

  if (!row) {
    recordFailedSignIn(null);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const now = Date.now();
  const lockout = lockoutStateFromRow(
    row.failureTimestampsUtcMs,
    row.lockedUntilUtcMs,
  );

  if (!isLoginAllowed(lockout, now)) {
    recordFailedSignIn(row.id);
    return NextResponse.json(
      { error: "Account temporarily locked. Try again later." },
      { status: 423 },
    );
  }

  const passwordOk = await verifyPassword(password, row.passwordHash);
  if (!passwordOk) {
    const next = applyFailedLoginAttempt(lockout, now, defaultLockoutConfig);
    db.update(users)
      .set({
        failureTimestampsUtcMs: JSON.stringify(next.failureTimestampsUtcMs),
        lockedUntilUtcMs: next.lockedUntilUtcMs,
      })
      .where(eq(users.id, row.id))
      .run();
    recordFailedSignIn(row.id);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const cleared = clearAfterSuccessfulLogin();
  db.update(users)
    .set({
      failureTimestampsUtcMs: JSON.stringify(cleared.failureTimestampsUtcMs),
      lockedUntilUtcMs: cleared.lockedUntilUtcMs,
    })
    .where(eq(users.id, row.id))
    .run();

  db.insert(authEvents)
    .values({
      id: randomUUID(),
      userId: row.id,
      email: emailRaw,
      eventType: "sign_in",
      occurredAtUtcMs: Date.now(),
    })
    .run();

  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  session.userId = row.id;
  session.email = row.email;
  session.role = row.role as SessionData["role"];
  await session.save();

  return NextResponse.json({ ok: true });
}
