import Database from "better-sqlite3";
import { openTestMemoryDb } from "@/test/pushTestSchema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { accounts, homeInvNumberSeq, homes, invoices, residents, users } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { bumpInvNumberSequence } from "./invoiceNumbers";

describe("invoiceNumbers", () => {
  const connections: Database.Database[] = [];

  afterEach(() => {
    for (const c of connections) c.close();
    connections.length = 0;
  });

  it("bumpInvNumberSequence allocates monotonic INV- per home and bootstraps from existing rows", () => {
    const { db, sqlite } = openTestMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    const homeId = "h1";

    db.insert(users)
      .values({
        id: "u1",
        email: "a@test",
        passwordHash: "x",
        role: "admin",
        createdAtUtcMs: t,
      })
      .run();
    db.insert(homes)
      .values({
        id: homeId,
        name: "H",
        defaultCurrencyCode: "NZD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    const accId = randomUUID();
    const resId = randomUUID();
    db.insert(residents)
      .values({
        id: resId,
        homeId,
        fullName: "R",
        normalizedFullName: "r",
        dob: "1940-01-01",
        admissionDate: "2025-01-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(accounts)
      .values({
        id: accId,
        accountType: "resident",
        residentId: resId,
        homeId: null,
        currencyCode: "NZD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    db.insert(invoices)
      .values({
        id: randomUUID(),
        accountId: accId,
        homeId,
        invNo: "INV-00042",
        purchaseOrderId: null,
        status: "draft",
        issuedOn: "2026-05-01",
        totalMinorSnapshot: null,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    const a = db.transaction((trx) => bumpInvNumberSequence(trx, homeId, t + 1));
    const b = db.transaction((trx) => bumpInvNumberSequence(trx, homeId, t + 2));
    expect(a).toBe("INV-00043");
    expect(b).toBe("INV-00044");
    const row = db.select().from(homeInvNumberSeq).where(eq(homeInvNumberSeq.homeId, homeId)).get();
    expect(row?.lastSuffix).toBe(44);
  });

  it("uses numeric order when digit width changes (lexicographic would collide)", () => {
    const { db, sqlite } = openTestMemoryDb();
    connections.push(sqlite);
    const t = Date.now();
    const homeId = "h1";

    db.insert(users)
      .values({
        id: "u1",
        email: "a@test",
        passwordHash: "x",
        role: "admin",
        createdAtUtcMs: t,
      })
      .run();
    db.insert(homes)
      .values({
        id: homeId,
        name: "H",
        defaultCurrencyCode: "NZD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    const accId = randomUUID();
    const resId = randomUUID();
    db.insert(residents)
      .values({
        id: resId,
        homeId,
        fullName: "R",
        normalizedFullName: "r",
        dob: "1940-01-01",
        admissionDate: "2025-01-01",
        status: "active",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    db.insert(accounts)
      .values({
        id: accId,
        accountType: "resident",
        residentId: resId,
        homeId: null,
        currencyCode: "NZD",
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();

    db.insert(invoices)
      .values([
        {
          id: randomUUID(),
          accountId: accId,
          homeId,
          invNo: "INV-100000",
          purchaseOrderId: null,
          status: "draft",
          issuedOn: "2026-05-01",
          totalMinorSnapshot: null,
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        },
        {
          id: randomUUID(),
          accountId: accId,
          homeId,
          invNo: "INV-099999",
          purchaseOrderId: null,
          status: "draft",
          issuedOn: "2026-05-02",
          totalMinorSnapshot: null,
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        },
      ])
      .run();

    const next = db.transaction((trx) => bumpInvNumberSequence(trx, homeId, t + 1));
    expect(next).toBe("INV-100001");
  });
});
