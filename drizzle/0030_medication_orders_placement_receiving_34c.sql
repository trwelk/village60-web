PRAGMA foreign_keys=OFF;--> statement-breakpoint
ALTER TABLE `medication_orders` ADD `order_placed_at_utc_ms` integer;--> statement-breakpoint
ALTER TABLE `medication_orders` ADD `order_placed_by_user_id` text REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `medication_orders` ADD `completed_at_utc_ms` integer;--> statement-breakpoint
ALTER TABLE `medication_order_lines` ADD `received_qty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `medication_order_lines` ADD `closed_short_at_utc_ms` integer;--> statement-breakpoint
ALTER TABLE `medication_order_lines` ADD `closed_short_reason` text;--> statement-breakpoint
ALTER TABLE `medication_order_lines` ADD `closed_short_by_user_id` text REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `resident_medication_stock_events` ADD `medication_order_line_id` text REFERENCES `medication_order_lines`(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `resident_medication_stock_events` ADD `idempotency_key` text;--> statement-breakpoint
DROP INDEX `medication_orders_resident_active_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `medication_orders_resident_active_uq` ON `medication_orders` (`resident_id`) WHERE `status` in ('pending', 'approved', 'order_placed');--> statement-breakpoint
CREATE UNIQUE INDEX `resident_medication_stock_events_order_line_idempotency_uq` ON `resident_medication_stock_events` (`medication_order_line_id`, `idempotency_key`) WHERE `medication_order_line_id` is not null AND `idempotency_key` is not null;--> statement-breakpoint
PRAGMA foreign_keys=ON;
