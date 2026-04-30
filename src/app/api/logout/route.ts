import { authEvents } from "@/db/schema";
import { getDb } from "@/db/client";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export async function POST() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const userId = session.userId ?? null;
  const email = session.email ?? "";

  session.destroy();
  await session.save();

  if (userId) {
    const db = getDb();
    db.insert(authEvents)
      .values({
        id: randomUUID(),
        userId,
        email,
        eventType: "sign_out",
        occurredAtUtcMs: Date.now(),
      })
      .run();
  }

  return NextResponse.json({ ok: true });
}
