ALTER TABLE `invoice_line_items` ADD `purchase_order_line_id` text REFERENCES `home_purchase_order_lines`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `invoice_line_items_po_line_idx` ON `invoice_line_items` (`purchase_order_line_id`);