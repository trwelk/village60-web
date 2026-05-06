import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  deleteResidentPortrait,
  readResidentPortraitBytes,
  uploadResidentPortrait,
} from "@/lib/residentPortraits/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ id: string; residentId: string }>;
};

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const { buffer, contentType } = readResidentPortraitBytes(
      getDb(),
      actor,
      homeId,
      residentId,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body." }, { status: 400 });
  }
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Expected multipart field "file".' },
      { status: 400 },
    );
  }
  try {
    const actor = requireSessionActor(session);
    const buf = new Uint8Array(await file.arrayBuffer());
    const out = uploadResidentPortrait(
      getDb(),
      actor,
      homeId,
      residentId,
      {
        bytes: buf,
        declaredContentType: typeof file.type === "string" ? file.type : "",
        originalFilename:
          typeof file.name === "string" ? file.name : "portrait.jpg",
      },
      Date.now(),
    );
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    deleteResidentPortrait(getDb(), actor, homeId, residentId, Date.now());
    return new Response(null, { status: 204 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}
