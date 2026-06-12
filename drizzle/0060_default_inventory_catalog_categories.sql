INSERT INTO `inventory_item_categories` (`id`, `home_id`, `name`, `created_at_utc_ms`, `updated_at_utc_ms`)
SELECT lower(hex(randomblob(16))), `h`.`id`, `cat`.`name`, CAST(unixepoch('now') * 1000 AS integer), CAST(unixepoch('now') * 1000 AS integer)
FROM `homes` `h`
CROSS JOIN (
  SELECT 'Medicine' AS `name`
  UNION ALL SELECT 'Groceries'
  UNION ALL SELECT 'Maintenance'
) `cat`
WHERE NOT EXISTS (
  SELECT 1
  FROM `inventory_item_categories` `c`
  WHERE `c`.`home_id` = `h`.`id`
    AND lower(trim(`c`.`name`)) = lower(trim(`cat`.`name`))
);
