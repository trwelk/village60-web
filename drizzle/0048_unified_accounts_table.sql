PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `account_type` text NOT NULL DEFAULT 'resident',
  `resident_id` text,
  `home_id` text,
  `currency_code` text NOT NULL,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `accounts_owner_shape_chk` CHECK (
    (`account_type` = 'resident' AND `resident_id` IS NOT NULL AND `home_id` IS NULL)
    OR
    (`account_type` = 'home' AND `home_id` IS NOT NULL AND `resident_id` IS NULL)
  )
);
--> statement-breakpoint
INSERT INTO `accounts` (
  `id`,
  `account_type`,
  `resident_id`,
  `home_id`,
  `currency_code`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
)
SELECT
  `id`,
  'resident',
  `resident_id`,
  NULL,
  `currency_code`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
FROM `resident_accounts`;
--> statement-breakpoint
INSERT INTO `accounts` (
  `id`,
  `account_type`,
  `resident_id`,
  `home_id`,
  `currency_code`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
)
SELECT
  `id`,
  'home',
  NULL,
  `home_id`,
  `currency_code`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
FROM `home_accounts`;
--> statement-breakpoint
CREATE TABLE `billing_payments_new` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `amount_minor` integer NOT NULL,
  `received_on` text NOT NULL,
  `method` text NOT NULL,
  `external_reference` text,
  `notes` text,
  `recorded_by_user_id` text,
  `ledger_transaction_id` text NOT NULL,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`ledger_transaction_id`) REFERENCES `billing_transactions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `billing_payments_new`
SELECT
  `id`,
  `account_id`,
  `amount_minor`,
  `received_on`,
  `method`,
  `external_reference`,
  `notes`,
  `recorded_by_user_id`,
  `ledger_transaction_id`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
FROM `billing_payments`;
--> statement-breakpoint
DROP TABLE `billing_payments`;
--> statement-breakpoint
ALTER TABLE `billing_payments_new` RENAME TO `billing_payments`;
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payments_ledger_transaction_uq` ON `billing_payments` (`ledger_transaction_id`);
--> statement-breakpoint
CREATE INDEX `billing_payments_account_received_idx` ON `billing_payments` (`account_id`, `received_on`);
--> statement-breakpoint
CREATE TABLE `invoices_new` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `status` text NOT NULL,
  `billing_period` text,
  `issued_on` text,
  `total_minor_snapshot` integer,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `invoices_new`
SELECT
  `id`,
  `account_id`,
  `status`,
  `billing_period`,
  `issued_on`,
  `total_minor_snapshot`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
FROM `invoices`;
--> statement-breakpoint
DROP TABLE `invoices`;
--> statement-breakpoint
ALTER TABLE `invoices_new` RENAME TO `invoices`;
--> statement-breakpoint
CREATE INDEX `invoices_account_status_issued_idx` ON `invoices` (`account_id`, `status`, `issued_on`);
--> statement-breakpoint
DROP TABLE `resident_accounts`;
--> statement-breakpoint
DROP TABLE `home_accounts`;
--> statement-breakpoint
PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_resident_uq` ON `accounts` (`resident_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_home_uq` ON `accounts` (`home_id`);
