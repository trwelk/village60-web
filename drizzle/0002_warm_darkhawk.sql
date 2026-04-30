CREATE TABLE `wards` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer,
	`archived_at_utc_ms` integer,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade
);
