CREATE TABLE `home_po_number_seq` (
	`home_id` text PRIMARY KEY NOT NULL REFERENCES `homes`(`id`) ON DELETE CASCADE,
	`last_suffix` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `home_po_number_seq` (`home_id`, `last_suffix`, `updated_at_utc_ms`)
SELECT
	substr(`app_settings`.`key`, 16) AS `home_id`,
	`app_settings`.`value_int`,
	`app_settings`.`updated_at_utc_ms`
FROM `app_settings`
	INNER JOIN `homes` ON `homes`.`id` = substr(`app_settings`.`key`, 16)
WHERE `app_settings`.`key` LIKE 'po_number_last:%';
--> statement-breakpoint
DELETE FROM `app_settings` WHERE `key` LIKE 'po_number_last:%';
