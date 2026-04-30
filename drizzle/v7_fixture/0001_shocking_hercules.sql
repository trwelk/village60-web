CREATE TABLE `homes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_currency_code` text NOT NULL,
	`archived_at_utc_ms` integer,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL
);
