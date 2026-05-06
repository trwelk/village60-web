import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homeExpensesErrorResponse } from "@/lib/homeExpenses/http";
import {
  deleteHomeExpenseAttachment,
  readHomeExpenseAttachmentBytes,
} from "@/lib/homeExpenseAttachments/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii.replace(/"/g, "\\\"")}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  _req: Request,
  ctx: {
    params: Promise<{ id: string; expenseId: string; attachmentId: string }>;
  },
) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, expenseId, attachmentId } = await ctx.params;
  try {
    const actor = requireSessionActor(session);
    const { buffer, filename, contentType } = readHomeExpenseAttachmentBytes(
      getDb(),
      actor,
      homeId,
      expenseId,
      attachmentId,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDispositionAttachment(filename),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const resp = homeExpensesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  ctx: {
    params: Promise<{ id: string; expenseId: string; attachmentId: string }>;
  },
) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, expenseId, attachmentId } = await ctx.params;
  try {
    const actor = requireSessionActor(session);
    deleteHomeExpenseAttachment(
      getDb(),
      actor,
      homeId,
      expenseId,
      attachmentId,
    );
    return new Response(null, { status: 204 });
  } catch (e) {
    const resp = homeExpensesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}
