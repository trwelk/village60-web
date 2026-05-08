CREATE TABLE `__new_inventory_suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`phone` text,
	`email` text,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_inventory_suppliers` (`id`, `name`, `created_at_utc_ms`, `updated_at_utc_ms`)
SELECT `id`, `name`, `created_at_utc_ms`, `updated_at_utc_ms`
FROM `inventory_suppliers`;
--> statement-breakpoint
DROP TABLE `inventory_suppliers`;
--> statement-breakpoint
ALTER TABLE `__new_inventory_suppliers` RENAME TO `inventory_suppliers`;
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_suppliers_name_uq` ON `inventory_suppliers` (lower(trim(`name`)));
