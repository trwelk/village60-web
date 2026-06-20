import { randomUUID } from "node:crypto";
import { pushTestSchema } from "@/test/pushTestSchema";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { homeInterestLeads, users } from "@/db/schema";
import { ForbiddenError } from "@/lib/homes/errors";
import { hashPassword } from "@/lib/iam/password";
import { createHome, updateHome } from "@/lib/homes/service";
import {
  createAdminInterestLead,
  listInterestLeadsForAdmin,
  listPublicInterestHomes,
  submitWebInterestLead,
  updateInterestLeadStatus,
} from "./service";

describe("home interest leads — public submit", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-interest-${randomUUID()}.sqlite`,
    );
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    pushTestSchema(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  const basePayload = {
    homeId: "",
    contactName: "Jamie Prospect",
    phone: "0800 TEST",
    email: null as string | null,
    note: null as string | null,
    consentAccepted: true,
    honeypot: "",
  };

  const meta = (ip: string, nowMs: number) => ({
    clientIpKey: ip,
    nowMs,
    rateLimitWindowMs: 3_600_000,
    rateLimitMaxPerWindow: 2,
  });

  it("creates a web lead with home snapshots for an active home", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Harbour Rest",
      defaultCurrencyCode: "NZD",
      address: " 99 Wharf Rd  ",
    });

    const now = 1_700_000_000_000;
    const result = submitWebInterestLead(
      db,
      { ...basePayload, homeId: home.id, email: "  a@x.co " },
      meta("203.0.113.9", now),
    );

    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;

    const row = db
      .select()
      .from(homeInterestLeads)
      .where(eq(homeInterestLeads.id, result.leadId))
      .get();
    expect(row).toBeDefined();
    expect(row!.homeId).toBe(home.id);
    expect(row!.homeNameSnapshot).toBe("Harbour Rest");
    expect(row!.homeAddressSnapshot).toBe("99 Wharf Rd");
    expect(row!.contactName).toBe("Jamie Prospect");
    expect(row!.phone).toBe("0800 TEST");
    expect(row!.email).toBe("a@x.co");
    expect(row!.note).toBeNull();
    expect(row!.source).toBe("web");
    expect(row!.consentAccepted).toBe(true);
    expect(row!.status).toBe("new");
    expect(row!.createdByUserId).toBeNull();
    expect(row!.createdAtUtcMs).toBe(now);
  });

  it("does not insert when honeypot is filled (silent discard)", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Quiet Cove",
      defaultCurrencyCode: "NZD",
    });

    const result = submitWebInterestLead(
      db,
      { ...basePayload, homeId: home.id, honeypot: "http://spam" },
      meta("198.51.100.2", Date.now()),
    );

    expect(result).toEqual({ outcome: "honeypot" });
    const n = db.select().from(homeInterestLeads).all();
    expect(n).toHaveLength(0);
  });

  it("rate limits after max submissions in the window", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Bay View",
      defaultCurrencyCode: "NZD",
    });
    const ip = "192.0.2.50";
    const t0 = 2_000_000_000_000;

    const a = submitWebInterestLead(
      db,
      { ...basePayload, homeId: home.id },
      meta(ip, t0),
    );
    const b = submitWebInterestLead(
      db,
      { ...basePayload, homeId: home.id, contactName: "Other Person" },
      meta(ip, t0 + 1_000),
    );
    const c = submitWebInterestLead(
      db,
      { ...basePayload, homeId: home.id, contactName: "Third" },
      meta(ip, t0 + 2_000),
    );

    expect(a.outcome).toBe("created");
    expect(b.outcome).toBe("created");
    expect(c).toEqual({ outcome: "rate_limited" });

    expect(db.select().from(homeInterestLeads).all()).toHaveLength(2);
  });

  it("listPublicInterestHomes excludes archived homes", () => {
    const db = getDb();
    const active = createHome(db, "admin", {
      name: "Active Villa",
      defaultCurrencyCode: "NZD",
    });
    const archived = createHome(db, "admin", {
      name: "Old Site",
      defaultCurrencyCode: "NZD",
    });
    updateHome(db, "admin", archived.id, { archived: true });

    const list = listPublicInterestHomes(db);
    expect(list.map((h) => h.id)).toEqual([active.id]);
    expect(list[0]!.name).toBe("Active Villa");
    expect(list[0]!.configuredBeds).toBe(0);
  });
});

async function insertAdminUser(
  db: ReturnType<typeof getDb>,
): Promise<{ id: string }> {
  const id = randomUUID();
  const now = Date.now();
  db.insert(users)
    .values({
      id,
      email: `leads-admin-${id.slice(0, 8)}@test.local`,
      passwordHash: await hashPassword("password_password_9"),
      role: "admin",
      failureTimestampsUtcMs: "[]",
      createdAtUtcMs: now,
    })
    .run();
  return { id };
}

describe("home interest leads — admin dashboard", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-leads-admin-${randomUUID()}.sqlite`,
    );
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    pushTestSchema(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("rejects list for care role (authorization)", () => {
    const db = getDb();
    expect(() => listInterestLeadsForAdmin(db, "care")).toThrow(ForbiddenError);
  });

  it("lists leads newest first for admin", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Rimu Grove",
      defaultCurrencyCode: "NZD",
    });
    const base = {
      homeId: home.id,
      contactName: "A",
      phone: "1",
      email: null as string | null,
      note: null as string | null,
      consentAccepted: true,
      honeypot: "",
    };
    submitWebInterestLead(db, base, {
      clientIpKey: "203.0.113.1",
      nowMs: 100,
    });
    submitWebInterestLead(db, { ...base, contactName: "B" }, {
      clientIpKey: "203.0.113.2",
      nowMs: 200,
    });
    const rows = listInterestLeadsForAdmin(db, "admin");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.contactName).toBe("B");
    expect(rows[1]!.contactName).toBe("A");
    expect(rows[0]!.homeId).toBe(home.id);
    expect(rows[1]!.homeId).toBe(home.id);
  });

  it("updates status and bumps updated_at for admin", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Kauri House",
      defaultCurrencyCode: "NZD",
    });
    const created = submitWebInterestLead(
      db,
      {
        homeId: home.id,
        contactName: "Casey",
        phone: "09",
        email: null,
        note: null,
        consentAccepted: true,
        honeypot: "",
      },
      { clientIpKey: "203.0.113.7", nowMs: 1_000 },
    );
    expect(created.outcome).toBe("created");
    if (created.outcome !== "created") return;
    updateInterestLeadStatus(db, "admin", created.leadId, "contacted", 9_000);
    const row = db
      .select()
      .from(homeInterestLeads)
      .where(eq(homeInterestLeads.id, created.leadId))
      .get()!;
    expect(row.status).toBe("contacted");
    expect(row.updatedAtUtcMs).toBe(9_000);
    expect(row.createdAtUtcMs).toBe(1_000);
  });

  it("admin create stores source, creator id, and home snapshots", async () => {
    const db = getDb();
    const adminUser = await insertAdminUser(db);
    const home = createHome(db, "admin", {
      name: "  Shoreline  ",
      defaultCurrencyCode: "NZD",
      address: "  12 Bay Rd  ",
    });
    const now = 8_888_000;
    const result = createAdminInterestLead(
      db,
      "admin",
      adminUser.id,
      {
        homeId: home.id,
        contactName: "  Phone-in  ",
        phone: " 021 555 ",
        email: " e@x.co ",
        note: "  Walk-in ",
      },
      now,
    );
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;
    const row = db
      .select()
      .from(homeInterestLeads)
      .where(eq(homeInterestLeads.id, result.leadId))
      .get()!;
    expect(row.source).toBe("admin");
    expect(row.createdByUserId).toBe(adminUser.id);
    expect(row.homeNameSnapshot).toBe("Shoreline");
    expect(row.homeAddressSnapshot).toBe("12 Bay Rd");
    expect(row.contactName).toBe("Phone-in");
    expect(row.phone).toBe("021 555");
    expect(row.email).toBe("e@x.co");
    expect(row.note).toBe("Walk-in");
    expect(row.consentAccepted).toBe(false);
    expect(row.status).toBe("new");
  });
});
