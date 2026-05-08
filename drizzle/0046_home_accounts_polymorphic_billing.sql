-- Create home_accounts: one operating-expense account per home.
CREATE TABLE `home_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `home_id` text NOT NULL,
  `currency_code` text NOT NULL,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `home_accounts_home_uq` ON `home_accounts` (`home_id`);
--> statement-breakpoint
-- Rebuild billing_transactions to drop the hard FK on account_id (which pointed
-- exclusively at resident_accounts) and add the account_type discriminator column.
-- All pre-existing rows are tagged 'resident' via the DEFAULT.
PRAGMA foreign_keys = OFF;
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
  `reverses_transaction_id` text,
  FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `billing_transactions_new`
  SELECT
    `id`,
    `account_id`,
    'resident',
    `txn_type`,
    `amount_minor`,
    `source_kind`,
    `source_id`,
    `memo`,
    `recorded_by_user_id`,
    `posted_at_utc_ms`,
    `reverses_transaction_id`
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
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_transactions_reverses_target_uq` ON `billing_transactions` (`reverses_transaction_id`);
