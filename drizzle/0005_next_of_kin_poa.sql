ALTER TABLE `residents` ADD `nok_name` text;
--> statement-breakpoint
ALTER TABLE `residents` ADD `nok_contact` text;
--> statement-breakpoint
ALTER TABLE `residents` ADD `nok_relationship` text;
--> statement-breakpoint
ALTER TABLE `residents` ADD `poa_same_as_nok` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `residents` ADD `poa_name` text;
--> statement-breakpoint
ALTER TABLE `residents` ADD `poa_contact` text;
--> statement-breakpoint
ALTER TABLE `residents` ADD `poa_relationship` text;
