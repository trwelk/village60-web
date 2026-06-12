ALTER TABLE `homes` ADD COLUMN `med_reorder_days_supply` integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE `homes` ADD COLUMN `med_reorder_servings_supply` integer DEFAULT 10 NOT NULL;
