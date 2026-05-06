PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_resident_medications` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`medication_id` text NOT NULL,
	`quantity_per_serving` real NOT NULL,
	`servings_per_day` integer,
	`directions` text NOT NULL,
	`prn` integer DEFAULT false NOT NULL,
	`minimum_in_stock` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`current_stock` real DEFAULT 0 NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_resident_medications`(`id`, `resident_id`, `medication_id`, `quantity_per_serving`, `servings_per_day`, `directions`, `prn`, `minimum_in_stock`, `sort_order`, `created_at_utc_ms`, `updated_at_utc_ms`) SELECT `id`, `resident_id`, `medication_id`, CAST(`quantity_per_serving` AS real), `servings_per_day`, `directions`, `prn`, `minimum_in_stock`, `sort_order`, `created_at_utc_ms`, `updated_at_utc_ms` FROM `resident_medications`;
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
--> statement-breakpoint
CREATE TABLE `resident_medication_stock_events` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_medication_id` text NOT NULL,
	`event_type` text NOT NULL,
	`amount` real NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`resident_medication_id`) REFERENCES `resident_medications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `resident_medication_stock_events_med_idx` ON `resident_medication_stock_events` (`resident_medication_id`);
