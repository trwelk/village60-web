ALTER TABLE `billing_transactions` ADD `reverses_transaction_id` text REFERENCES `billing_transactions`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_transactions_reverses_target_uq` ON `billing_transactions` (`reverses_transaction_id`);
