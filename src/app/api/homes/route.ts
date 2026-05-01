import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  createHome,
  DEFAULT_HOMES_PAGE_SIZE,
  listHomes,
  listHomesPage,
  MAX_HOMES_PAGE_SIZE,
} from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null || raw === "") {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return fallback;
  }
  return n;
}

export async function GET(req: Request) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const url = new URL(req.url);
  const wantsPaged =
    url.searchParams.has("page") || url.searchParams.has("pageSize");
  try {
    const actor = requireSessionActor(session);
    if (wantsPaged) {
      const page = parsePositiveInt(url.searchParams.get("page"), 1);
      const pageSize = Math.min(
        MAX_HOMES_PAGE_SIZE,
        Math.max(
          1,
          parsePositiveInt(
            url.searchParams.get("pageSize"),
            DEFAULT_HOMES_PAGE_SIZE,
          ),
        ),
      );
      const out = listHomesPage(getDb(), actor, { page, pageSize });
      return NextResponse.json({
        homes: out.rows,
        totalCount: out.totalCount,
        page: out.page,
        pageSize: out.pageSize,
      });
    }
    const homes = listHomes(getDb(), actor);
    return NextResponse.json({ homes });
  } catch (e) {
    const resp = homesErrorResponse(e);
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
  const name =
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    typeof (body as { name: unknown }).name === "string"
      ? (body as { name: string }).name
      : "";
  const defaultCurrencyCode =
    typeof body === "object" &&
    body !== null &&
    "defaultCurrencyCode" in body &&
    typeof (body as { defaultCurrencyCode: unknown }).defaultCurrencyCode ===
      "string"
      ? (body as { defaultCurrencyCode: string }).defaultCurrencyCode
      : "";

  let address: string | undefined;
  if (
    typeof body === "object" &&
    body !== null &&
    "address" in body &&
    (body as { address: unknown }).address !== undefined
  ) {
    const raw = (body as { address: unknown }).address;
    if (typeof raw !== "string") {
      return NextResponse.json(
        { error: "address must be a string when provided." },
        { status: 400 },
      );
    }
    address = raw;
  }

  if (!name.trim() || !defaultCurrencyCode.trim()) {
    return NextResponse.json(
      { error: "name and defaultCurrencyCode are required." },
      { status: 400 },
    );
  }

  try {
    const home = createHome(getDb(), session.role, {
      name,
      defaultCurrencyCode,
      ...(address !== undefined ? { address } : {}),
    });
    return NextResponse.json({ home });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
