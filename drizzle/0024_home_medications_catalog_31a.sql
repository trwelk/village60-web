CREATE TABLE `medications` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`name` text NOT NULL,
	`strength` text NOT NULL,
	`unit` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `medications_home_idx` ON `medications` (`home_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `medications_home_name_strength_unit_uq` ON `medications` (`home_id`,lower(trim("name")),lower(trim("strength")),trim("unit"));--> statement-breakpoint
ALTER TABLE `resident_medications` ADD `medication_id` text REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE restrict;