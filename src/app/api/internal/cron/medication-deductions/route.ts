import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { homesErrorResponse } from "@/lib/homes/http";
import { runNightlyMedicationAutoDeductions } from "@/lib/residents/medicationNightlyDeductions";
import { NextResponse } from "next/server";

function hashUtf8(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

function cronBearerAuthorized(req: Request, secret: string): boolean {
  const raw = req.headers.get("authorization");
  if (!raw) {
    return false;
  }
  const m = /^Bearer\s+(\S+)/i.exec(raw.trim());
  if (!m) {
    return false;
  }
  const token = m[1]!;
  const a = hashUtf8(token);
  const b = hashUtf8(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Internal cron: nightly scheduled medication stock deductions (**32c**).
 * Production: schedule `POST` with `Authorization: Bearer $CRON_SECRET` once per day (e.g. 00:10 UTC).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || !cronBearerAuthorized(req, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = runNightlyMedicationAutoDeductions(getDb());
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}
