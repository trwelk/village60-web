import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  createTask,
  listTasksForInboxQuery,
  parseTaskInboxQuery,
} from "@/lib/tasks/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function objectBody(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : null;
}

export async function GET(request: Request) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  let query;
  try {
    query = parseTaskInboxQuery(new URL(request.url));
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
  try {
    const tasks = listTasksForInboxQuery(
      getDb(),
      requireSessionActor(session),
      query,
    );
    return NextResponse.json({ tasks });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
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
  const rec = objectBody(body);
  if (!rec) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const homeId = typeof rec.homeId === "string" ? rec.homeId : "";
  const title = typeof rec.title === "string" ? rec.title : "";
  const notes =
    rec.notes === null || typeof rec.notes === "string" ? rec.notes : undefined;
  const dueDate =
    rec.dueDate === null || typeof rec.dueDate === "string"
      ? rec.dueDate
      : undefined;
  const priority = typeof rec.priority === "string" ? rec.priority : undefined;
  if (!homeId.trim() || !title.trim()) {
    return NextResponse.json(
      { error: "homeId and title are required." },
      { status: 400 },
    );
  }

  try {
    const task = createTask(getDb(), requireSessionActor(session), {
      homeId,
      title,
      notes,
      dueDate,
      priority,
    });
    return NextResponse.json({ task });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
