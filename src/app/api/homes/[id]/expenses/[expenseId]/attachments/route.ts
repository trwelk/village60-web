import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homeExpensesErrorResponse } from "@/lib/homeExpenses/http";
import {
  listHomeExpenseAttachments,
  uploadHomeExpenseAttachment,
} from "@/lib/homeExpenseAttachments/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; expenseId: string }> },
) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, expenseId } = await ctx.params;
  try {
    const actor = requireSessionActor(session);
    const attachments = listHomeExpenseAttachments(
      getDb(),
      actor,
      homeId,
      expenseId,
    );
    return NextResponse.json({ attachments });
  } catch (e) {
    const resp = homeExpensesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; expenseId: string }> },
) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, expenseId } = await ctx.params;
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
    const attachment = uploadHomeExpenseAttachment(
      getDb(),
      actor,
      homeId,
      expenseId,
      {
        bytes: buf,
        declaredContentType: typeof file.type === "string" ? file.type : "",
        originalFilename: typeof file.name === "string" ? file.name : "attachment",
      },
      Date.now(),
    );
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (e) {
    const resp = homeExpensesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}
