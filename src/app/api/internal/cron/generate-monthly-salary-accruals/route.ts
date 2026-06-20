import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  parseBillingMonth,
  shiftBillingMonth,
  utcBillingMonthFromMs,
} from "@/lib/billing/billingMonth";
import { ValidationError } from "@/lib/homes/errors";
import { homesErrorResponse } from "@/lib/homes/http";
import { generateMonthlySalaryAccrualsForAllHomes } from "@/lib/salaries/accruals";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

function resolveSalaryAccrualCronActor(db: ReturnType<typeof getDb>): SessionActor {
  const admin = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.createdAtUtcMs))
    .limit(1)
    .get();
  if (!admin) {
    throw new ValidationError("No admin user exists for salary accrual cron.");
  }
  return { userId: admin.id, role: "admin" };
}

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
 * Internal cron: accrue previous calendar month salary charges for all homes.
 * Production: schedule `POST` with `Authorization: Bearer $CRON_SECRET` at **00:05 UTC on the 1st**
 * of each month (defaults to the previous UTC billing month unless `billingMonth` is supplied in JSON).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || !cronBearerAuthorized(req, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const currentMonth = utcBillingMonthFromMs(Date.now());
  let billingMonth = shiftBillingMonth(currentMonth, -1);
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
    const actor = resolveSalaryAccrualCronActor(db);
    const generate = generateMonthlySalaryAccrualsForAllHomes(
      db,
      actor,
      { billingMonth },
    );
    return NextResponse.json({ generate });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}
