PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP INDEX IF EXISTS `resident_medication_stock_events_order_line_idempotency_uq`;
--> statement-breakpoint
DROP INDEX IF EXISTS `resident_medication_stock_events_order_line_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `resident_medication_stock_events_med_idx`;
--> statement-breakpoint
DROP TABLE IF EXISTS `resident_medication_stock_events`;
--> statement-breakpoint
DROP TABLE IF EXISTS `medication_order_lines`;
--> statement-breakpoint
DROP TABLE IF EXISTS `medication_orders`;
--> statement-breakpoint
DELETE FROM `app_settings` WHERE `key` = 'medication_order_coverage_months';
--> statement-breakpoint
CREATE TABLE `__new_resident_medications` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`medication_id` text NOT NULL,
	`quantity_per_serving` real NOT NULL,
	`servings_per_day` integer,
	`directions` text NOT NULL,
	`prn` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_resident_medications`(`id`, `resident_id`, `medication_id`, `quantity_per_serving`, `servings_per_day`, `directions`, `prn`, `status`, `sort_order`, `created_at_utc_ms`, `updated_at_utc_ms`) SELECT `id`, `resident_id`, `medication_id`, CAST(`quantity_per_serving` AS real), `servings_per_day`, `directions`, `prn`, `status`, `sort_order`, `created_at_utc_ms`, `updated_at_utc_ms` FROM `resident_medications`;
--> statement-breakpoint
DROP TABLE `resident_medications`;
--> statement-breakpoint
ALTER TABLE `__new_resident_medications` RENAME TO `resident_medications`;
--> statement-breakpoint
CREATE INDEX `resident_medications_resident_idx` ON `resident_medications` (`resident_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `resident_medications_resident_medication_uq` ON `resident_medications` (`resident_id`,`medication_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
