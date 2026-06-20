import { randomUUID } from "node:crypto";
import { pushTestSchema } from "@/test/pushTestSchema";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { closeDbConnection, getDb } from "@/db/client";
import { inventoryItemCategories } from "@/db/schema";
import { DEFAULT_INVENTORY_CATALOG_CATEGORY_NAMES } from "@/lib/inventory/defaultCatalogCategories";
import { createHome, updateHome } from "./service";

describe("homes service — address", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-homes-${randomUUID()}.sqlite`);
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

  it("createHome stores trimmed address or null when omitted or blank", () => {
    const db = getDb();
    const a = createHome(db, "admin", {
      name: "Rimu",
      defaultCurrencyCode: "NZD",
      address: "  10 Lane \nCity  ",
    });
    expect(a.address).toBe("10 Lane \nCity");

    const b = createHome(db, "admin", {
      name: "Kauri",
      defaultCurrencyCode: "NZD",
    });
    expect(b.address).toBeNull();

    const c = createHome(db, "admin", {
      name: "Miro",
      defaultCurrencyCode: "NZD",
      address: "   ",
    });
    expect(c.address).toBeNull();
  });

  it("createHome seeds default inventory catalog categories", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Oak",
      defaultCurrencyCode: "NZD",
    });
    const categories = db
      .select({ name: inventoryItemCategories.name })
      .from(inventoryItemCategories)
      .where(eq(inventoryItemCategories.homeId, home.id))
      .orderBy(asc(inventoryItemCategories.name))
      .all()
      .map((row) => row.name);
    expect(categories).toHaveLength(DEFAULT_INVENTORY_CATALOG_CATEGORY_NAMES.length);
    expect(categories).toEqual(
      expect.arrayContaining([...DEFAULT_INVENTORY_CATALOG_CATEGORY_NAMES]),
    );
  });

  it("updateHome sets or clears address without touching other fields unnecessarily", () => {
    const db = getDb();
    let h = createHome(db, "admin", {
      name: "Fixed",
      defaultCurrencyCode: "NZD",
    });
    const createdAt = h.createdAtUtcMs;

    h = updateHome(db, "admin", h.id, { address: "99 Road" });
    expect(h.address).toBe("99 Road");
    expect(h.createdAtUtcMs).toBe(createdAt);

    h = updateHome(db, "admin", h.id, { address: null });
    expect(h.address).toBeNull();
  });
});
