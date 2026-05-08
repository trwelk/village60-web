ALTER TABLE `home_purchase_orders` ADD `currency_code` text;
--> statement-breakpoint
ALTER TABLE `home_purchase_order_receive_events` RENAME COLUMN `unit_price_event` TO `unit_price_cents`;
--> statement-breakpoint
UPDATE `home_purchase_order_receive_events` SET `unit_price_cents` = CAST(ROUND(`unit_price_cents` * 100) AS INTEGER);
