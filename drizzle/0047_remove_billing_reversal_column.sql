PRAGMA foreign_keys = OFF;
--> statement-breakpoint
DROP INDEX IF EXISTS `billing_transactions_reverses_target_uq`;
--> statement-breakpoint
CREATE TABLE `billing_transactions_new` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `account_type` text NOT NULL DEFAULT 'resident',
  `txn_type` text NOT NULL,
  `amount_minor` integer NOT NULL,
  `source_kind` text NOT NULL,
  `source_id` text,
  `memo` text,
  `recorded_by_user_id` text,
  `posted_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `billing_transactions_new`
  SELECT
    `id`,
    `account_id`,
    `account_type`,
    `txn_type`,
    `amount_minor`,
    `source_kind`,
    `source_id`,
    `memo`,
    `recorded_by_user_id`,
    `posted_at_utc_ms`
  FROM `billing_transactions`;
--> statement-breakpoint
DROP TABLE `billing_transactions`;
--> statement-breakpoint
ALTER TABLE `billing_transactions_new` RENAME TO `billing_transactions`;
--> statement-breakpoint
PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE INDEX `billing_transactions_account_posted_idx` ON `billing_transactions` (`account_id`, `posted_at_utc_ms`);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_transactions_source_uq` ON `billing_transactions` (`source_kind`, `source_id`);
