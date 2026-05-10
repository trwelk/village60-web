DROP INDEX IF EXISTS `billing_payments_account_received_idx`;
--> statement-breakpoint
ALTER TABLE `billing_payments` RENAME COLUMN `received_on` TO `received_on_legacy`;
--> statement-breakpoint
ALTER TABLE `billing_payments` ADD COLUMN `received_on` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `billing_payments` SET `received_on` =
  CAST(strftime('%s', datetime(substr(trim(received_on_legacy), 1, 10))) AS INTEGER)
  * 1000;
--> statement-breakpoint
ALTER TABLE `billing_payments` DROP COLUMN `received_on_legacy`;
--> statement-breakpoint
ALTER TABLE `billing_payments` DROP COLUMN `created_at_utc_ms`;
--> statement-breakpoint
CREATE INDEX `billing_payments_account_received_idx` ON `billing_payments` (`account_id`,`received_on`);
