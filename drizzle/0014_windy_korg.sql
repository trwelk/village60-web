CREATE TABLE `resident_monthly_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`billing_month` text NOT NULL,
	`ward_id_snapshot` text NOT NULL,
	`amount_minor_snapshot` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ward_id_snapshot`) REFERENCES `wards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resident_monthly_charges_resident_billing_uq` ON `resident_monthly_charges` (`resident_id`,`billing_month`);--> statement-breakpoint
CREATE TABLE `resident_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_monthly_charge_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`paid_on` text NOT NULL,
	`notes` text,
	`recorded_by_user_id` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_monthly_charge_id`) REFERENCES `resident_monthly_charges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resident_payments_resident_monthly_charge_id_unique` ON `resident_payments` (`resident_monthly_charge_id`);--> statement-breakpoint
ALTER TABLE `wards` ADD `monthly_rate_per_person_minor` integer;