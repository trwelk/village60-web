CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`due_date` text,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`completed_at_utc_ms` integer,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tasks_home_status_idx` ON `tasks` (`home_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_status_created_idx` ON `tasks` (`status`,`created_at_utc_ms`);
