CREATE TABLE `other_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`received` integer DEFAULT false NOT NULL,
	`paid_on` text,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `other_charges_resident_type_uq` ON `other_charges` (`resident_id`,`type`);--> statement-breakpoint
CREATE INDEX `other_charges_resident_idx` ON `other_charges` (`resident_id`);