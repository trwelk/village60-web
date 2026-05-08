DROP TABLE IF EXISTS `resident_payments`;
--> statement-breakpoint
DROP TABLE IF EXISTS `resident_monthly_charges`;
--> statement-breakpoint
DROP TABLE IF EXISTS `other_charges`;
--> statement-breakpoint
CREATE TABLE `resident_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `resident_id` text NOT NULL,
  `currency_code` text NOT NULL,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resident_accounts_resident_uq` ON `resident_accounts` (`resident_id`);
--> statement-breakpoint
CREATE TABLE `billing_transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `txn_type` text NOT NULL,
  `amount_minor` integer NOT NULL,
  `source_kind` text NOT NULL,
  `source_id` text,
  `memo` text,
  `recorded_by_user_id` text,
  `posted_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `resident_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `billing_transactions_account_posted_idx` ON `billing_transactions` (`account_id`, `posted_at_utc_ms`);
--> statement-breakpoint
CREATE INDEX `billing_transactions_source_idx` ON `billing_transactions` (`source_kind`, `source_id`);
--> statement-breakpoint
CREATE TABLE `billing_payments` (
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
  FOREIGN KEY (`account_id`) REFERENCES `resident_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`ledger_transaction_id`) REFERENCES `billing_transactions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payments_ledger_transaction_uq` ON `billing_payments` (`ledger_transaction_id`);
--> statement-breakpoint
CREATE INDEX `billing_payments_account_received_idx` ON `billing_payments` (`account_id`, `received_on`);
--> statement-breakpoint
CREATE TABLE `invoices` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `status` text NOT NULL,
  `billing_period` text,
  `issued_on` text,
  `total_minor_snapshot` integer,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `resident_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoices_account_status_issued_idx` ON `invoices` (`account_id`, `status`, `issued_on`);
--> statement-breakpoint
CREATE TABLE `invoice_line_items` (
  `id` text PRIMARY KEY NOT NULL,
  `invoice_id` text NOT NULL,
  `category` text NOT NULL,
  `description` text NOT NULL,
  `amount_minor` integer NOT NULL,
  `service_month` text,
  `ward_id_snapshot` text,
  `quantity` integer NOT NULL DEFAULT 1,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`ward_id_snapshot`) REFERENCES `wards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `invoice_line_items_invoice_idx` ON `invoice_line_items` (`invoice_id`);
