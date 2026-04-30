ALTER TABLE `residents` ADD `assigned_nurse_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `residents` ADD `assigned_nurse_display_override` text;--> statement-breakpoint
ALTER TABLE `residents` ADD `last_payment_date` text;--> statement-breakpoint
ALTER TABLE `residents` ADD `last_payment_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `residents` ADD `amount_owing_minor` integer;