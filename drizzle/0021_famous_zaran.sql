CREATE TABLE `home_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`expense_type_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`incurred_on` text NOT NULL,
	`paid_on` text,
	`vendor` text,
	`invoice_reference` text,
	`note` text,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	`created_by_user_id` text,
	`updated_by_user_id` text,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`expense_type_id`) REFERENCES `expense_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `home_expenses_home_incurred_idx` ON `home_expenses` (`home_id`,`incurred_on`);--> statement-breakpoint
CREATE INDEX `home_expenses_type_idx` ON `home_expenses` (`expense_type_id`);