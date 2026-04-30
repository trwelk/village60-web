CREATE TABLE `residents` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`full_name` text NOT NULL,
	`normalized_full_name` text NOT NULL,
	`dob` text NOT NULL,
	`admission_date` text NOT NULL,
	`ward_id` text,
	`room_text` text,
	`status` text NOT NULL,
	`departure_reason` text,
	`departure_at_utc_ms` integer,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ward_id`) REFERENCES `wards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `residents_home_dob_normname_uq` ON `residents` (`home_id`,`dob`,`normalized_full_name`);