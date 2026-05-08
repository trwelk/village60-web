DROP INDEX IF EXISTS `billing_transactions_source_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_transactions_source_uq` ON `billing_transactions` (`source_kind`,`source_id`);
