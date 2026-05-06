import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  homeInterestLeadSubmitBuckets,
  homeInterestLeads,
  homes,
  wards,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import type { SessionUserRole } from "@/lib/session";

export type PublicInterestHomeOption = {
  id: string;
  name: string;
  address: string | null;
  /** Non-archived wards: sum of `bed_count` (0 if no wards configured). */
  configuredBeds: number;
};

/** Default: 20 submissions per IP per rolling hour (production). */
export const INTEREST_LEAD_RATE_WINDOW_MS = 60 * 60 * 1000;
export const INTEREST_LEAD_RATE_MAX_PER_WINDOW = 20;

export type WebInterestLeadPayload = {
  homeId: string;
  contactName: string;
  phone: string;
  email?: string | null;
  note?: string | null;
  consentAccepted: boolean;
  /** Hidden anti-bot field; submissions must leave this empty. */
  honeypot: string;
};

export type SubmitWebInterestLeadMeta = {
  clientIpKey: string;
  nowMs: number;
  /** Test overrides only */
  rateLimitWindowMs?: number;
  rateLimitMaxPerWindow?: number;
};

export type SubmitWebInterestLeadResult =
  | { outcome: "created"; leadId: string }
  | { outcome: "honeypot" }
  | { outcome: "rate_limited" }
  | { outcome: "validation_error"; message: string };

export const INTEREST_LEAD_STATUSES = [
  "new",
  "contacted",
  "cancelled",
  "closed",
] as const;

export type InterestLeadStatus = (typeof INTEREST_LEAD_STATUSES)[number];

export type AdminInterestLeadListItem = {
  id: string;
  homeId: string;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
  contactName: string;
  phone: string;
  email: string | null;
  note: string | null;
  homeNameSnapshot: string;
  homeAddressSnapshot: string | null;
  status: string;
  source: string;
};

export type AdminCreateInterestLeadInput = {
  homeId: string;
  contactName: string;
  phone: string;
  email?: string | null;
  note?: string | null;
};

export type CreateAdminInterestLeadResult =
  | { outcome: "created"; leadId: string }
  | { outcome: "validation_error"; message: string };

function requireLeadsAdmin(role: SessionUserRole | undefined): void {
  if (role !== "admin") {
    throw new ForbiddenError();
  }
}

function assertInterestLeadStatus(raw: string): InterestLeadStatus {
  for (const s of INTEREST_LEAD_STATUSES) {
    if (s === raw) return s;
  }
  throw new ValidationError("Status must be new, contacted, cancelled, or closed.");
}

export function listInterestLeadsForAdmin(
  db: AppDb,
  actorRole: SessionUserRole | undefined,
): AdminInterestLeadListItem[] {
  requireLeadsAdmin(actorRole);
  return db
    .select({
      id: homeInterestLeads.id,
      homeId: homeInterestLeads.homeId,
      createdAtUtcMs: homeInterestLeads.createdAtUtcMs,
      updatedAtUtcMs: homeInterestLeads.updatedAtUtcMs,
      contactName: homeInterestLeads.contactName,
      phone: homeInterestLeads.phone,
      email: homeInterestLeads.email,
      note: homeInterestLeads.note,
      homeNameSnapshot: homeInterestLeads.homeNameSnapshot,
      homeAddressSnapshot: homeInterestLeads.homeAddressSnapshot,
      status: homeInterestLeads.status,
      source: homeInterestLeads.source,
    })
    .from(homeInterestLeads)
    .orderBy(desc(homeInterestLeads.createdAtUtcMs))
    .all();
}

export function updateInterestLeadStatus(
  db: AppDb,
  actorRole: SessionUserRole | undefined,
  leadId: string,
  statusRaw: string,
  nowMs: number,
): void {
  requireLeadsAdmin(actorRole);
  const status = assertInterestLeadStatus(statusRaw.trim());
  const existing = db
    .select({ id: homeInterestLeads.id })
    .from(homeInterestLeads)
    .where(eq(homeInterestLeads.id, leadId))
    .get();
  if (!existing) {
    throw new NotFoundError("Lead not found.");
  }
  db.update(homeInterestLeads)
    .set({
      status,
      updatedAtUtcMs: nowMs,
    })
    .where(eq(homeInterestLeads.id, leadId))
    .run();
}

export function createAdminInterestLead(
  db: AppDb,
  actorRole: SessionUserRole | undefined,
  createdByUserId: string,
  input: AdminCreateInterestLeadInput,
  nowMs: number,
): CreateAdminInterestLeadResult {
  requireLeadsAdmin(actorRole);

  const homeId = input.homeId.trim();
  const contactName = input.contactName.trim();
  const phone = input.phone.trim();
  if (!homeId) {
    return { outcome: "validation_error", message: "Select a home." };
  }
  if (!contactName) {
    return { outcome: "validation_error", message: "Name is required." };
  }
  if (!phone) {
    return { outcome: "validation_error", message: "Phone is required." };
  }

  const rawEmail =
    input.email === undefined || input.email === null
      ? ""
      : String(input.email).trim();
  const emailValue = rawEmail === "" ? null : rawEmail;

  const rawNote =
    input.note === undefined || input.note === null
      ? ""
      : String(input.note).trim();
  const noteValue = rawNote === "" ? null : rawNote;

  const home = db
    .select({
      id: homes.id,
      name: homes.name,
      address: homes.address,
    })
    .from(homes)
    .where(and(eq(homes.id, homeId), isNull(homes.archivedAtUtcMs)))
    .get();

  if (!home) {
    return {
      outcome: "validation_error",
      message: "That home is not available for enquiries.",
    };
  }

  const leadId = randomUUID();
  db.insert(homeInterestLeads)
    .values({
      id: leadId,
      homeId: home.id,
      homeNameSnapshot: home.name,
      homeAddressSnapshot: home.address ?? null,
      contactName,
      phone,
      email: emailValue,
      note: noteValue,
      source: "admin",
      consentAccepted: false,
      status: "new",
      createdByUserId,
      createdAtUtcMs: nowMs,
      updatedAtUtcMs: nowMs,
    })
    .run();

  return { outcome: "created", leadId };
}

export function listPublicInterestHomes(db: AppDb): PublicInterestHomeOption[] {
  const homeRows = db
    .select({
      id: homes.id,
      name: homes.name,
      address: homes.address,
    })
    .from(homes)
    .where(isNull(homes.archivedAtUtcMs))
    .orderBy(asc(homes.name))
    .all();

  const bedAgg = db
    .select({
      homeId: wards.homeId,
      total: sql<number>`ifnull(sum(${wards.bedCount}), 0)`,
    })
    .from(wards)
    .innerJoin(homes, eq(wards.homeId, homes.id))
    .where(
      and(isNull(homes.archivedAtUtcMs), isNull(wards.archivedAtUtcMs)),
    )
    .groupBy(wards.homeId)
    .all();

  const bedsByHome = new Map(
    bedAgg.map((r) => [r.homeId, Number(r.total)]),
  );

  return homeRows.map((h) => ({
    ...h,
    configuredBeds: bedsByHome.get(h.id) ?? 0,
  }));
}

export function submitWebInterestLead(
  db: AppDb,
  payload: WebInterestLeadPayload,
  meta: SubmitWebInterestLeadMeta,
): SubmitWebInterestLeadResult {
  if (payload.honeypot.trim() !== "") {
    return { outcome: "honeypot" };
  }
  if (!payload.consentAccepted) {
    return {
      outcome: "validation_error",
      message: "Consent is required to submit this form.",
    };
  }

  const homeId = payload.homeId.trim();
  const contactName = payload.contactName.trim();
  const phone = payload.phone.trim();
  if (!homeId) {
    return { outcome: "validation_error", message: "Select a home." };
  }
  if (!contactName) {
    return { outcome: "validation_error", message: "Name is required." };
  }
  if (!phone) {
    return { outcome: "validation_error", message: "Phone is required." };
  }

  const rawEmail =
    payload.email === undefined || payload.email === null
      ? ""
      : String(payload.email).trim();
  const emailValue = rawEmail === "" ? null : rawEmail;

  const rawNote =
    payload.note === undefined || payload.note === null
      ? ""
      : String(payload.note).trim();
  const noteValue = rawNote === "" ? null : rawNote;

  const windowMs =
    meta.rateLimitWindowMs ?? INTEREST_LEAD_RATE_WINDOW_MS;
  const maxPerWindow =
    meta.rateLimitMaxPerWindow ?? INTEREST_LEAD_RATE_MAX_PER_WINDOW;
  const ipKey = meta.clientIpKey.trim() || "unknown";

  return db.transaction((tx): SubmitWebInterestLeadResult => {
    const home = tx
      .select({
        id: homes.id,
        name: homes.name,
        address: homes.address,
      })
      .from(homes)
      .where(and(eq(homes.id, homeId), isNull(homes.archivedAtUtcMs)))
      .get();

    if (!home) {
      return {
        outcome: "validation_error",
        message: "That home is not available for enquiries.",
      };
    }

    const bucket = tx
      .select()
      .from(homeInterestLeadSubmitBuckets)
      .where(eq(homeInterestLeadSubmitBuckets.ipKey, ipKey))
      .get();

    if (
      bucket &&
      meta.nowMs - bucket.windowStartUtcMs < windowMs &&
      bucket.count >= maxPerWindow
    ) {
      return { outcome: "rate_limited" };
    }

    let nextWindowStart = meta.nowMs;
    let nextCount = 1;
    if (
      bucket &&
      meta.nowMs - bucket.windowStartUtcMs < windowMs
    ) {
      nextWindowStart = bucket.windowStartUtcMs;
      nextCount = bucket.count + 1;
    }

    if (bucket) {
      tx.update(homeInterestLeadSubmitBuckets)
        .set({
          windowStartUtcMs: nextWindowStart,
          count: nextCount,
        })
        .where(eq(homeInterestLeadSubmitBuckets.ipKey, ipKey))
        .run();
    } else {
      tx.insert(homeInterestLeadSubmitBuckets)
        .values({
          ipKey,
          windowStartUtcMs: nextWindowStart,
          count: nextCount,
        })
        .run();
    }

    const leadId = randomUUID();
    const ts = meta.nowMs;
    tx.insert(homeInterestLeads)
      .values({
        id: leadId,
        homeId: home.id,
        homeNameSnapshot: home.name,
        homeAddressSnapshot: home.address ?? null,
        contactName,
        phone,
        email: emailValue,
        note: noteValue,
        source: "web",
        consentAccepted: true,
        status: "new",
        createdByUserId: null,
        createdAtUtcMs: ts,
        updatedAtUtcMs: ts,
      })
      .run();

    return { outcome: "created", leadId };
  });
}
