import { getDb } from "@/db/client";
import {
  submitWebInterestLead,
} from "@/lib/homeInterestLeads/service";
import { clientIpKeyFromRequest } from "@/lib/http/clientIp";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;

  const homeId = typeof rec.homeId === "string" ? rec.homeId : "";
  const contactName =
    typeof rec.contactName === "string" ? rec.contactName : "";
  const phone = typeof rec.phone === "string" ? rec.phone : "";
  const email = typeof rec.email === "string" ? rec.email : null;
  const note = typeof rec.note === "string" ? rec.note : null;
  const consentAccepted = rec.consentAccepted === true;
  const honeypot =
    typeof rec.website === "string"
      ? rec.website
      : typeof rec.honeypot === "string"
        ? rec.honeypot
        : "";

  const result = submitWebInterestLead(
    getDb(),
    {
      homeId,
      contactName,
      phone,
      email,
      note,
      consentAccepted,
      honeypot,
    },
    { clientIpKey: clientIpKeyFromRequest(req), nowMs: Date.now() },
  );

  switch (result.outcome) {
    case "created":
    case "honeypot":
      return NextResponse.json({ ok: true });
    case "rate_limited":
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 },
      );
    case "validation_error":
      return NextResponse.json({ error: result.message }, { status: 400 });
    default:
      return NextResponse.json({ error: "Request failed." }, { status: 500 });
  }
}
