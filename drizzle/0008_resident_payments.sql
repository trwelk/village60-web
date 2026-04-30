ALTER TABLE `residents` ADD `monthly_fee_minor` integer;--> statement-breakpoint
CREATE TABLE `resident_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`notes` text,
	`recorded_by_user_id` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
CREATE INDEX `resident_payments_resident_idx` ON `resident_payments` (`resident_id`);--> statement-breakpoint
INSERT INTO `resident_payments` (
	`id`, `resident_id`, `date`, `amount_minor`, `notes`,
	`recorded_by_user_id`, `created_at_utc_ms`, `updated_at_utc_ms`
)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
	r.`id`,
	r.`last_payment_date`,
	r.`last_payment_amount_minor`,
	NULL,
	(SELECT `id` FROM `users` WHERE `role` = 'admin' ORDER BY `created_at_utc_ms` ASC LIMIT 1),
	(CAST(strftime('%s', 'now') AS INTEGER) * 1000),
	(CAST(strftime('%s', 'now') AS INTEGER) * 1000)
FROM `residents` r
WHERE r.`last_payment_date` IS NOT NULL
  AND r.`last_payment_amount_minor` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `residents` DROP COLUMN `last_payment_date`;--> statement-breakpoint
ALTER TABLE `residents` DROP COLUMN `last_payment_amount_minor`;--> statement-breakpoint
ALTER TABLE `residents` DROP COLUMN `amount_owing_minor`;
