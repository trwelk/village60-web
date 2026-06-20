import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import {
  parseBillingMonth,
  utcBillingMonthFromMs,
} from "@/lib/billing/billingMonth";
import { generateAndFinalizeMonthlyCharges } from "@/lib/billing/generateMonthlyCharges";
import { homesErrorResponse } from "@/lib/homes/http";
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
 * Internal cron: open monthly invoices and finalize them (ledger charges post).
 * Production: schedule `POST` with `Authorization: Bearer $CRON_SECRET` at **00:05 UTC on the 1st**
 * of each month (targets the current UTC month unless `billingMonth` is supplied in JSON).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || !cronBearerAuthorized(req, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let billingMonth = utcBillingMonthFromMs(Date.now());
  try {
    const text = await req.text();
    if (text.trim() !== "") {
      const body: unknown = JSON.parse(text);
      if (
        body !== null &&
        typeof body === "object" &&
        "billingMonth" in body
      ) {
        const raw = (body as { billingMonth: unknown }).billingMonth;
        if (raw !== undefined) {
          if (typeof raw !== "string") {
            return NextResponse.json(
              { error: "billingMonth must be a string." },
              { status: 400 },
            );
          }
          billingMonth = parseBillingMonth(raw);
        }
      }
    }
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const db = getDb();
    const result = generateAndFinalizeMonthlyCharges(db, { billingMonth });
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}
