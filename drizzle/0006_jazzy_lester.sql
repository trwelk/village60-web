CREATE TABLE `resident_allergies` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`allergen` text NOT NULL,
	`notes` text,
	`sort_order` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resident_allergies_resident_idx` ON `resident_allergies` (`resident_id`);--> statement-breakpoint
CREATE TABLE `resident_conditions` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resident_conditions_resident_idx` ON `resident_conditions` (`resident_id`);--> statement-breakpoint
CREATE TABLE `resident_medications` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`name` text NOT NULL,
	`dose` text NOT NULL,
	`frequency` text NOT NULL,
	`timing_notes` text,
	`prn` integer DEFAULT false NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resident_medications_resident_idx` ON `resident_medications` (`resident_id`);