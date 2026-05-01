CREATE TABLE `home_interest_lead_submit_buckets` (
	`ip_key` text PRIMARY KEY NOT NULL,
	`window_start_utc_ms` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `home_interest_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`home_name_snapshot` text NOT NULL,
	`home_address_snapshot` text,
	`contact_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`note` text,
	`source` text NOT NULL,
	`consent_accepted` integer NOT NULL,
	`status` text NOT NULL,
	`created_by_user_id` text,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
