import type { AppDb } from "@/lib/homes/service";
import { inventoryItemCategories } from "@/db/schema";
import { eq } from "drizzle-orm";

export function inventoryCategoryIdForHome(homeId: string): string {
  return `${homeId}-test-category`;
}

/** Seed a home inventory category required by `inventory_items.category_id`. */
export function seedInventoryCategory(
  db: AppDb,
  homeId: string,
  t: number = Date.now(),
): string {
  const id = inventoryCategoryIdForHome(homeId);
  const existing = db
    .select({ id: inventoryItemCategories.id })
    .from(inventoryItemCategories)
    .where(eq(inventoryItemCategories.id, id))
    .get();
  if (existing) return id;
  db.insert(inventoryItemCategories)
    .values({
      id,
      homeId,
      name: "General",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  return id;
}
