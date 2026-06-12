ALTER TABLE `homes` ADD COLUMN `med_low_stock_days_threshold` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `homes` ADD COLUMN `med_low_stock_servings_threshold` integer DEFAULT 5 NOT NULL;
