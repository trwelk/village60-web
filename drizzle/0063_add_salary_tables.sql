CREATE TABLE `staff_salaries` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL REFERENCES `homes`(`id`) ON DELETE cascade,
	`user_id` text REFERENCES `users`(`id`) ON DELETE set null,
	`full_name` text NOT NULL,
	`role_title` text NOT NULL,
	`monthly_salary_minor` integer NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`status` text NOT NULL,
	`phone` text,
	`notes` text,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `staff_salaries_home_status_idx` ON `staff_salaries` (`home_id`,`status`);--> statement-breakpoint
CREATE INDEX `staff_salaries_user_idx` ON `staff_salaries` (`user_id`);--> statement-breakpoint
CREATE TABLE `salary_remittances` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_salary_id` text NOT NULL REFERENCES `staff_salaries`(`id`) ON DELETE cascade,
	`home_id` text NOT NULL REFERENCES `homes`(`id`) ON DELETE cascade,
	`period_year` integer NOT NULL,
	`period_month` integer NOT NULL,
	`amount_paid_minor` integer NOT NULL,
	`paid_on` text NOT NULL,
	`payment_method` text,
	`reference` text,
	`marked_by_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE restrict,
	`notes` text,
	`created_at_utc_ms` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `salary_remittances_staff_period_uq` ON `salary_remittances` (`staff_salary_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE INDEX `salary_remittances_home_period_idx` ON `salary_remittances` (`home_id`,`period_year`,`period_month`);
