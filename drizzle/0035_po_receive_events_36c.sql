CREATE TABLE `home_purchase_order_receive_events` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`purchase_order_line_id` text NOT NULL,
	`qty_received_event` real NOT NULL,
	`base_units_received_event` real NOT NULL,
	`unit_price_event` real NOT NULL,
	`currency_code` text NOT NULL,
	`received_at_utc_ms` integer NOT NULL,
	`note` text,
	`created_by_user_id` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `home_purchase_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_order_line_id`) REFERENCES `home_purchase_order_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `home_po_receive_events_po_line_idx` ON `home_purchase_order_receive_events` (`purchase_order_line_id`,`received_at_utc_ms`);
--> statement-breakpoint
CREATE INDEX `home_po_receive_events_po_currency_idx` ON `home_purchase_order_receive_events` (`purchase_order_id`,`currency_code`);
