CREATE TABLE `home_inv_number_seq` (
	`home_id` text PRIMARY KEY NOT NULL REFERENCES `homes`(`id`) ON DELETE CASCADE,
	`last_suffix` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL
);
