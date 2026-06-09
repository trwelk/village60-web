ALTER TABLE `resident_medications` ADD `scheduled_slots` text;
--> statement-breakpoint
UPDATE `resident_medications` SET `scheduled_slots` = '["morning"]' WHERE `prn` = 0 AND `servings_per_day` = 1 AND `scheduled_slots` IS NULL;
--> statement-breakpoint
UPDATE `resident_medications` SET `scheduled_slots` = '["morning","evening"]' WHERE `prn` = 0 AND `servings_per_day` = 2 AND `scheduled_slots` IS NULL;
--> statement-breakpoint
UPDATE `resident_medications` SET `scheduled_slots` = '["morning","afternoon","evening"]' WHERE `prn` = 0 AND `servings_per_day` = 3 AND `scheduled_slots` IS NULL;
--> statement-breakpoint
UPDATE `resident_medications` SET `scheduled_slots` = '["morning","afternoon","evening","night"]' WHERE `prn` = 0 AND (`servings_per_day` >= 4 OR `servings_per_day` IS NULL) AND `scheduled_slots` IS NULL;
--> statement-breakpoint
CREATE TABLE `medication_administrations` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`resident_id` text NOT NULL,
	`resident_medication_id` text NOT NULL,
	`slot` text NOT NULL,
	`date` text NOT NULL,
	`administered_by_user_id` text NOT NULL,
	`notes` text,
	`administered_at_utc_ms` integer NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_medication_id`) REFERENCES `resident_medications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`administered_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `medication_administrations_home_date_idx` ON `medication_administrations` (`home_id`,`date`);
--> statement-breakpoint
CREATE INDEX `medication_administrations_resident_medication_idx` ON `medication_administrations` (`resident_medication_id`,`date`);
--> statement-breakpoint
CREATE UNIQUE INDEX `medication_administrations_scheduled_uq` ON `medication_administrations` (`resident_medication_id`,`slot`,`date`) WHERE "medication_administrations"."slot" != 'prn';
