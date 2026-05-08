CREATE TABLE `__supplier_keep` AS
SELECT lower(trim(`name`)) AS `name_norm`, min(`id`) AS `keep_id`
FROM `inventory_suppliers`
GROUP BY lower(trim(`name`));
--> statement-breakpoint
UPDATE `home_purchase_orders`
SET `supplier_id` = (
  SELECT sk.`keep_id`
  FROM `inventory_suppliers` s
  INNER JOIN `__supplier_keep` sk ON sk.`name_norm` = lower(trim(s.`name`))
  WHERE s.`id` = `home_purchase_orders`.`supplier_id`
  LIMIT 1
);
--> statement-breakpoint
CREATE TABLE `__new_inventory_suppliers` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `address` text,
  `phone` text,
  `email` text,
  `created_at_utc_ms` integer NOT NULL,
  `updated_at_utc_ms` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_inventory_suppliers` (
  `id`,
  `name`,
  `address`,
  `phone`,
  `email`,
  `created_at_utc_ms`,
  `updated_at_utc_ms`
)
SELECT
  s.`id`,
  s.`name`,
  s.`address`,
  s.`phone`,
  s.`email`,
  s.`created_at_utc_ms`,
  s.`updated_at_utc_ms`
FROM `inventory_suppliers` s
INNER JOIN `__supplier_keep` sk ON sk.`keep_id` = s.`id`;
--> statement-breakpoint
DROP TABLE `inventory_suppliers`;
--> statement-breakpoint
ALTER TABLE `__new_inventory_suppliers` RENAME TO `inventory_suppliers`;
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_suppliers_name_uq` ON `inventory_suppliers` (lower(trim(`name`)));
--> statement-breakpoint
DROP TABLE `__supplier_keep`;
