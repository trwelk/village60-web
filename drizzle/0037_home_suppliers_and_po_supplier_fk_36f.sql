CREATE TABLE `inventory_suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_suppliers_home_idx` ON `inventory_suppliers` (`home_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_suppliers_home_name_uq` ON `inventory_suppliers` (`home_id`,lower(trim("name")));
--> statement-breakpoint
INSERT INTO `inventory_suppliers` (`id`, `home_id`, `name`, `created_at_utc_ms`, `updated_at_utc_ms`)
SELECT lower(hex(randomblob(16))), `home_id`, trim(`supplier_name`), `created_at_utc_ms`, `updated_at_utc_ms`
FROM (
  SELECT DISTINCT `home_id`, `supplier_name`, `created_at_utc_ms`, `updated_at_utc_ms`
  FROM `home_purchase_orders`
);
--> statement-breakpoint
ALTER TABLE `home_purchase_orders` ADD `supplier_id` text;
--> statement-breakpoint
UPDATE `home_purchase_orders`
SET `supplier_id` = (
  SELECT s.`id`
  FROM `inventory_suppliers` s
  WHERE s.`home_id` = `home_purchase_orders`.`home_id`
    AND lower(trim(s.`name`)) = lower(trim(`home_purchase_orders`.`supplier_name`))
  LIMIT 1
);
--> statement-breakpoint
CREATE TABLE `__new_home_purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`po_number` text NOT NULL,
	`supplier_id` text NOT NULL,
	`status` text NOT NULL,
	`approved_at_utc_ms` integer,
	`approved_by_user_id` text,
	`sent_at_utc_ms` integer,
	`sent_by_user_id` text,
	`created_by_user_id` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supplier_id`) REFERENCES `inventory_suppliers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sent_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_home_purchase_orders` (
  `id`,
  `home_id`,
  `po_number`,
  `supplier_id`,
  `status`,
  `approved_at_utc_ms`,
  `approved_by_user_id`,
  `sent_at_utc_ms`,
  `sent_by_user_id`,
  `created_by_user_id`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
)
SELECT
  `id`,
  `home_id`,
  `po_number`,
  `supplier_id`,
  `status`,
  `approved_at_utc_ms`,
  `approved_by_user_id`,
  `sent_at_utc_ms`,
  `sent_by_user_id`,
  `created_by_user_id`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
FROM `home_purchase_orders`;
--> statement-breakpoint
DROP TABLE `home_purchase_orders`;
--> statement-breakpoint
ALTER TABLE `__new_home_purchase_orders` RENAME TO `home_purchase_orders`;
--> statement-breakpoint
CREATE UNIQUE INDEX `home_purchase_orders_home_po_number_uq` ON `home_purchase_orders` (`home_id`,`po_number`);
--> statement-breakpoint
CREATE INDEX `home_purchase_orders_home_status_idx` ON `home_purchase_orders` (`home_id`,`status`);
