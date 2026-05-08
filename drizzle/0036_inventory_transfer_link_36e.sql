ALTER TABLE `inventory_transactions` ADD `transfer_id` text;
--> statement-breakpoint
CREATE INDEX `inventory_transactions_transfer_idx` ON `inventory_transactions` (`transfer_id`);
