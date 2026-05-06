DROP TABLE `resident_medications`;--> statement-breakpoint
CREATE TABLE `resident_medications` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`medication_id` text NOT NULL,
	`quantity_per_serving` text NOT NULL,
	`servings_per_day` integer,
	`directions` text NOT NULL,
	`prn` integer DEFAULT false NOT NULL,
	`minimum_in_stock` integer,
	`sort_order` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `resident_medications_resident_idx` ON `resident_medications` (`resident_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `resident_medications_resident_medication_uq` ON `resident_medications` (`resident_id`,`medication_id`);
