CREATE TABLE `home_expense_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`home_expense_id` text NOT NULL,
	`original_filename` text NOT NULL,
	`stored_relative_path` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`home_expense_id`) REFERENCES `home_expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `home_expense_attachments_expense_idx` ON `home_expense_attachments` (`home_expense_id`);