CREATE TABLE `expense_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_types_name_ci_uq` ON `expense_types` (lower(trim("name")));