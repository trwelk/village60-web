PRAGMA foreign_keys=OFF;
--> statement-breakpoint
INSERT INTO `inventory_item_categories` (`id`, `home_id`, `name`, `created_at_utc_ms`, `updated_at_utc_ms`)
SELECT lower(hex(randomblob(16))), h.`id`, 'Medication', CAST(unixepoch('now') * 1000 AS integer), CAST(unixepoch('now') * 1000 AS integer)
FROM `homes` h
WHERE NOT EXISTS (
  SELECT 1
  FROM `inventory_item_categories` c
  WHERE c.`home_id` = h.`id` AND lower(trim(c.`name`)) = 'medication'
);
--> statement-breakpoint
INSERT INTO `inventory_items` (`id`, `home_id`, `category_id`, `name`, `base_unit`, `unit_class`, `created_at_utc_ms`, `updated_at_utc_ms`)
SELECT
  lower(hex(randomblob(16))),
  m.`home_id`,
  (
    SELECT c.`id`
    FROM `inventory_item_categories` c
    WHERE c.`home_id` = m.`home_id` AND lower(trim(c.`name`)) = 'medication'
    ORDER BY c.`created_at_utc_ms` ASC
    LIMIT 1
  ),
  m.`name` || ' (' || m.`strength` || ')',
  m.`unit`,
  'countable',
  CAST(unixepoch('now') * 1000 AS integer),
  CAST(unixepoch('now') * 1000 AS integer)
FROM `medications` m
WHERE NOT EXISTS (
  SELECT 1
  FROM `inventory_items` i
  WHERE i.`home_id` = m.`home_id`
    AND lower(trim(i.`name`)) = lower(trim(m.`name` || ' (' || m.`strength` || ')'))
    AND trim(i.`base_unit`) = trim(m.`unit`)
);
--> statement-breakpoint
CREATE TABLE `__new_resident_medications` (
  `id` text PRIMARY KEY NOT NULL,
  `resident_id` text NOT NULL,
  `item_id` text NOT NULL,
  `quantity_per_serving` real NOT NULL,
  `servings_per_day` integer,
  `directions` text NOT NULL,
  `prn` integer DEFAULT false NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `sort_order` integer NOT NULL,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_resident_medications` (
  `id`,
  `resident_id`,
  `item_id`,
  `quantity_per_serving`,
  `servings_per_day`,
  `directions`,
  `prn`,
  `status`,
  `sort_order`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
)
SELECT
  rm.`id`,
  rm.`resident_id`,
  i.`id`,
  rm.`quantity_per_serving`,
  rm.`servings_per_day`,
  rm.`directions`,
  rm.`prn`,
  rm.`status`,
  rm.`sort_order`,
  rm.`created_at_utc_ms`,
  rm.`updated_at_utc_ms`
FROM `resident_medications` rm
JOIN `medications` m ON m.`id` = rm.`medication_id`
JOIN `inventory_items` i
  ON i.`home_id` = m.`home_id`
 AND lower(trim(i.`name`)) = lower(trim(m.`name` || ' (' || m.`strength` || ')'))
 AND trim(i.`base_unit`) = trim(m.`unit`);
--> statement-breakpoint
DROP TABLE `resident_medications`;
--> statement-breakpoint
ALTER TABLE `__new_resident_medications` RENAME TO `resident_medications`;
--> statement-breakpoint
DROP INDEX IF EXISTS `resident_medications_resident_medication_uq`;
--> statement-breakpoint
CREATE INDEX `resident_medications_resident_idx` ON `resident_medications` (`resident_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `resident_medications_resident_item_uq` ON `resident_medications` (`resident_id`, `item_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
