import { randomUUID } from "node:crypto";
import { inventoryItemCategories } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";

/** Default inventory catalog categories provisioned for every home. */
export const DEFAULT_INVENTORY_CATALOG_CATEGORY_NAMES = [
  "Medicine",
  "Groceries",
  "Maintenance",
] as const;

export type DefaultInventoryCatalogCategoryName =
  (typeof DEFAULT_INVENTORY_CATALOG_CATEGORY_NAMES)[number];

export function seedDefaultInventoryCatalogCategoriesForHome(
  db: AppDb,
  homeId: string,
  nowUtcMs: number,
) {
  for (const name of DEFAULT_INVENTORY_CATALOG_CATEGORY_NAMES) {
    db.insert(inventoryItemCategories)
      .values({
        id: randomUUID(),
        homeId,
        name,
        createdAtUtcMs: nowUtcMs,
        updatedAtUtcMs: nowUtcMs,
      })
      .run();
  }
}
