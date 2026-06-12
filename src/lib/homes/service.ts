import { randomUUID } from "node:crypto";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { asc, count, eq, inArray } from "drizzle-orm";
import type * as schema from "@/db/schema";
import { homes } from "@/db/schema";
import { getCareUserAssignedHomeIds } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import type { SessionUserRole } from "@/lib/session";
import { seedDefaultInventoryCatalogCategoriesForHome } from "@/lib/inventory/defaultCatalogCategories";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";

export type AppDb = BetterSQLite3Database<typeof schema>;

export type Home = typeof homes.$inferSelect;

export const DEFAULT_HOMES_PAGE_SIZE = 25;
export const MAX_HOMES_PAGE_SIZE = 100;

export { DEFAULT_CURRENCY_CODE } from "./defaultCurrencyCode";

export const DEFAULT_MED_LOW_STOCK_DAYS_THRESHOLD = 5;
export const DEFAULT_MED_LOW_STOCK_SERVINGS_THRESHOLD = 5;
export const DEFAULT_MED_REORDER_DAYS_SUPPLY = 14;
export const DEFAULT_MED_REORDER_SERVINGS_SUPPLY = 10;

function requireHomeAdmin(role: SessionUserRole | undefined): void {
  if (role !== "admin") {
    throw new ForbiddenError();
  }
}

function normalizeCurrencyCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new ValidationError(
      "defaultCurrencyCode must be a 3-letter ISO 4217 code.",
    );
  }
  return code;
}

function normalizeName(raw: string): string {
  const name = raw.trim();
  if (!name) {
    throw new ValidationError("name is required.");
  }
  return name;
}

/** Trim outer whitespace; blank → null. Preserves inner newlines. */
function normalizeOptionalAddress(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const t = raw.trim();
  return t === "" ? null : t;
}

function normalizePositiveIntThreshold(
  raw: number,
  label: string,
  max = 365,
): number {
  if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
    throw new ValidationError(`${label} must be a positive integer.`);
  }
  if (raw > max) {
    throw new ValidationError(`${label} must be at most ${max}.`);
  }
  return raw;
}

export function createHome(
  db: AppDb,
  actorRole: SessionUserRole | undefined,
  input: { name: string; defaultCurrencyCode: string; address?: string },
): Home {
  requireHomeAdmin(actorRole);
  const now = Date.now();
  const id = randomUUID();
  const row: Home = {
    id,
    name: normalizeName(input.name),
    address: normalizeOptionalAddress(input.address),
    defaultCurrencyCode: normalizeCurrencyCode(input.defaultCurrencyCode),
    medLowStockDaysThreshold: DEFAULT_MED_LOW_STOCK_DAYS_THRESHOLD,
    medLowStockServingsThreshold: DEFAULT_MED_LOW_STOCK_SERVINGS_THRESHOLD,
    medReorderDaysSupply: DEFAULT_MED_REORDER_DAYS_SUPPLY,
    medReorderServingsSupply: DEFAULT_MED_REORDER_SERVINGS_SUPPLY,
    archivedAtUtcMs: null,
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
  db.insert(homes).values(row).run();
  seedDefaultInventoryCatalogCategoriesForHome(db, id, now);
  return row;
}

export function listHomes(db: AppDb, actor: SessionActor | undefined): Home[] {
  if (!actor) {
    throw new ForbiddenError();
  }
  if (actor.role === "admin") {
    return db.select().from(homes).orderBy(asc(homes.name)).all();
  }
  const allowed = getCareUserAssignedHomeIds(db, actor.userId);
  if (allowed.size === 0) {
    return [];
  }
  return db
    .select()
    .from(homes)
    .where(inArray(homes.id, [...allowed]))
    .orderBy(asc(homes.name))
    .all();
}

const homesListOrder = [asc(homes.name), asc(homes.id)];

/**
 * Paged list for dashboard directory views. Admin: all homes. Care: assigned homes
 * only. Ordered by `name` asc, `id` asc.
 */
export function listHomesPage(
  db: AppDb,
  actor: SessionActor | undefined,
  options: { page: number; pageSize: number },
): { rows: Home[]; totalCount: number; page: number; pageSize: number } {
  if (!actor) {
    throw new ForbiddenError();
  }
  const page = Math.max(1, Math.floor(options.page) || 1);
  const rawSize = Math.floor(options.pageSize) || DEFAULT_HOMES_PAGE_SIZE;
  const pageSize = Math.min(
    MAX_HOMES_PAGE_SIZE,
    Math.max(1, rawSize),
  );
  const offset = (page - 1) * pageSize;

  if (actor.role === "admin") {
    const countRow = db
      .select({ n: count() })
      .from(homes)
      .get();
    const totalCount = countRow?.n ?? 0;
    const rows = db
      .select()
      .from(homes)
      .orderBy(...homesListOrder)
      .limit(pageSize)
      .offset(offset)
      .all();
    return { rows, totalCount, page, pageSize };
  }

  const allowed = getCareUserAssignedHomeIds(db, actor.userId);
  if (allowed.size === 0) {
    return { rows: [], totalCount: 0, page, pageSize };
  }
  const idList = [...allowed];
  const countRow = db
    .select({ n: count() })
    .from(homes)
    .where(inArray(homes.id, idList))
    .get();
  const totalCount = countRow?.n ?? 0;
  const rows = db
    .select()
    .from(homes)
    .where(inArray(homes.id, idList))
    .orderBy(...homesListOrder)
    .limit(pageSize)
    .offset(offset)
    .all();
  return { rows, totalCount, page, pageSize };
}

export function updateHome(
  db: AppDb,
  actorRole: SessionUserRole | undefined,
  homeId: string,
  input: {
    name?: string;
    defaultCurrencyCode?: string;
    archived?: boolean;
    /** Omit = unchanged; `null` clears. */
    address?: string | null;
    medLowStockDaysThreshold?: number;
    medLowStockServingsThreshold?: number;
    medReorderDaysSupply?: number;
    medReorderServingsSupply?: number;
  },
): Home {
  requireHomeAdmin(actorRole);
  const existing = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!existing) {
    throw new NotFoundError();
  }
  const now = Date.now();
  let name = existing.name;
  let defaultCurrencyCode = existing.defaultCurrencyCode;
  let archivedAtUtcMs = existing.archivedAtUtcMs;
  let address = existing.address ?? null;
  let medLowStockDaysThreshold = existing.medLowStockDaysThreshold;
  let medLowStockServingsThreshold = existing.medLowStockServingsThreshold;
  let medReorderDaysSupply = existing.medReorderDaysSupply;
  let medReorderServingsSupply = existing.medReorderServingsSupply;

  if (input.name !== undefined) {
    name = normalizeName(input.name);
  }
  if (input.defaultCurrencyCode !== undefined) {
    defaultCurrencyCode = normalizeCurrencyCode(input.defaultCurrencyCode);
  }
  if (input.archived === true) {
    archivedAtUtcMs = now;
  } else if (input.archived === false) {
    archivedAtUtcMs = null;
  }
  if (input.address !== undefined) {
    address =
      input.address === null ? null : normalizeOptionalAddress(input.address);
  }
  if (input.medLowStockDaysThreshold !== undefined) {
    medLowStockDaysThreshold = normalizePositiveIntThreshold(
      input.medLowStockDaysThreshold,
      "medLowStockDaysThreshold",
    );
  }
  if (input.medLowStockServingsThreshold !== undefined) {
    medLowStockServingsThreshold = normalizePositiveIntThreshold(
      input.medLowStockServingsThreshold,
      "medLowStockServingsThreshold",
    );
  }
  if (input.medReorderDaysSupply !== undefined) {
    medReorderDaysSupply = normalizePositiveIntThreshold(
      input.medReorderDaysSupply,
      "medReorderDaysSupply",
    );
  }
  if (input.medReorderServingsSupply !== undefined) {
    medReorderServingsSupply = normalizePositiveIntThreshold(
      input.medReorderServingsSupply,
      "medReorderServingsSupply",
    );
  }

  db.update(homes)
    .set({
      name,
      address,
      defaultCurrencyCode,
      medLowStockDaysThreshold,
      medLowStockServingsThreshold,
      medReorderDaysSupply,
      medReorderServingsSupply,
      archivedAtUtcMs,
      updatedAtUtcMs: now,
    })
    .where(eq(homes.id, homeId))
    .run();

  const updated = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!updated) {
    throw new NotFoundError();
  }
  return updated;
}
