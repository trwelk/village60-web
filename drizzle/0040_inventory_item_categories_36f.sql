CREATE TABLE `inventory_item_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_item_categories_home_idx` ON `inventory_item_categories` (`home_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_categories_home_name_uq` ON `inventory_item_categories` (`home_id`, lower(trim("name")));
--> statement-breakpoint
INSERT INTO `inventory_item_categories` (`id`, `home_id`, `name`, `created_at_utc_ms`, `updated_at_utc_ms`)
SELECT lower(hex(randomblob(16))), `id`, 'Uncategorized', CAST(unixepoch('now') * 1000 AS integer), CAST(unixepoch('now') * 1000 AS integer)
FROM `homes`;
--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `category_id` text REFERENCES `inventory_item_categories`(`id`) ON DELETE restrict;
--> statement-breakpoint
UPDATE `inventory_items`
SET `category_id` = (
  SELECT `id`
  FROM `inventory_item_categories` c
  WHERE c.`home_id` = `inventory_items`.`home_id`
  ORDER BY c.`created_at_utc_ms` ASC
  LIMIT 1
);
--> statement-breakpoint
CREATE TABLE `__new_inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`base_unit` text NOT NULL,
	`unit_class` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `inventory_item_categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_inventory_items` (`id`, `home_id`, `category_id`, `name`, `base_unit`, `unit_class`, `created_at_utc_ms`, `updated_at_utc_ms`)
SELECT `id`, `home_id`, `category_id`, `name`, `base_unit`, `unit_class`, `created_at_utc_ms`, `updated_at_utc_ms`
FROM `inventory_items`;
--> statement-breakpoint
DROP TABLE `inventory_items`;
--> statement-breakpoint
ALTER TABLE `__new_inventory_items` RENAME TO `inventory_items`;
--> statement-breakpoint
CREATE INDEX `inventory_items_home_idx` ON `inventory_items` (`home_id`);
--> statement-breakpoint
CREATE INDEX `inventory_items_category_idx` ON `inventory_items` (`category_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_home_name_base_unit_uq` ON `inventory_items` (`home_id`, lower(trim("name")), trim("base_unit"));
