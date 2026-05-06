CREATE TABLE `medication_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`resident_id` text NOT NULL,
	`status` text NOT NULL,
	`created_by_user_id` text,
	`approved_by_user_id` text,
	`rejected_by_user_id` text,
	`cancelled_by_user_id` text,
	`approved_at_utc_ms` integer,
	`rejected_at_utc_ms` integer,
	`cancelled_at_utc_ms` integer,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rejected_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `medication_orders_resident_active_uq` ON `medication_orders` (`resident_id`) WHERE `status` IN ('pending', 'approved');
--> statement-breakpoint
CREATE INDEX `medication_orders_home_status_idx` ON `medication_orders` (`home_id`, `status`);
--> statement-breakpoint
CREATE TABLE `medication_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`resident_medication_id` text NOT NULL,
	`ordered_qty` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `medication_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_medication_id`) REFERENCES `resident_medications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `medication_order_lines_order_res_med_uq` ON `medication_order_lines` (`order_id`, `resident_medication_id`);
--> statement-breakpoint
CREATE INDEX `medication_order_lines_order_idx` ON `medication_order_lines` (`order_id`);
