ALTER TABLE `invoices` ADD COLUMN `home_id` text REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `inv_no` text;
--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `purchase_order_id` text REFERENCES `home_purchase_orders`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
UPDATE `invoices`
SET `home_id` = (
  SELECT `r`.`home_id`
  FROM `accounts` AS `a`
  INNER JOIN `residents` AS `r` ON `r`.`id` = `a`.`resident_id`
  WHERE `a`.`id` = `invoices`.`account_id` AND `a`.`account_type` = 'resident'
  LIMIT 1
)
WHERE `home_id` IS NULL;
--> statement-breakpoint
UPDATE `invoices`
SET `home_id` = (
  SELECT `a`.`home_id`
  FROM `accounts` AS `a`
  WHERE `a`.`id` = `invoices`.`account_id` AND `a`.`account_type` = 'home'
  LIMIT 1
)
WHERE `home_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_home_inv_no_uq` ON `invoices` (`home_id`, `inv_no`) WHERE `inv_no` IS NOT NULL AND `home_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_po_account_uq` ON `invoices` (`purchase_order_id`, `account_id`) WHERE `purchase_order_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `invoices_home_created_idx` ON `invoices` (`home_id`, `created_at_utc_ms`);
