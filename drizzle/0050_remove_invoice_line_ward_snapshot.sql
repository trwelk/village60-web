PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE `invoice_line_items_new` (
  `id` text PRIMARY KEY NOT NULL,
  `invoice_id` text NOT NULL,
  `category` text NOT NULL,
  `description` text NOT NULL,
  `amount_minor` integer NOT NULL,
  `service_month` text,
  `quantity` integer NOT NULL DEFAULT 1,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `invoice_line_items_new` (
  `id`,
  `invoice_id`,
  `category`,
  `description`,
  `amount_minor`,
  `service_month`,
  `quantity`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
)
SELECT
  `id`,
  `invoice_id`,
  `category`,
  `description`,
  `amount_minor`,
  `service_month`,
  `quantity`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
FROM `invoice_line_items`;
--> statement-breakpoint
DROP TABLE `invoice_line_items`;
--> statement-breakpoint
ALTER TABLE `invoice_line_items_new` RENAME TO `invoice_line_items`;
--> statement-breakpoint
CREATE INDEX `invoice_line_items_invoice_idx` ON `invoice_line_items` (`invoice_id`);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
