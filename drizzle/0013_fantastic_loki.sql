DROP TABLE `resident_payments`;--> statement-breakpoint
ALTER TABLE `residents` DROP COLUMN `monthly_fee_minor`;--> statement-breakpoint
ALTER TABLE `residents` DROP COLUMN `registration_fee_minor`;--> statement-breakpoint
ALTER TABLE `residents` DROP COLUMN `initial_deposit_minor`;