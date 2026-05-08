CREATE TABLE `home_purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`po_number` text NOT NULL,
	`supplier_name` text NOT NULL,
	`status` text NOT NULL,
	`approved_at_utc_ms` integer,
	`approved_by_user_id` text,
	`sent_at_utc_ms` integer,
	`sent_by_user_id` text,
	`created_by_user_id` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sent_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `home_purchase_orders_home_po_number_uq` ON `home_purchase_orders` (`home_id`,`po_number`);
--> statement-breakpoint
CREATE INDEX `home_purchase_orders_home_status_idx` ON `home_purchase_orders` (`home_id`,`status`);
--> statement-breakpoint
CREATE TABLE `home_purchase_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`item_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`quantity_ordered_base_units` real NOT NULL,
	`quantity_received_base_units` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `home_purchase_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `home_purchase_order_lines_order_idx` ON `home_purchase_order_lines` (`purchase_order_id`);
--> statement-breakpoint
CREATE INDEX `home_purchase_order_lines_owner_idx` ON `home_purchase_order_lines` (`owner_type`,`owner_id`);
