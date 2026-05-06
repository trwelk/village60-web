CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`home_id` text NOT NULL,
	`name` text NOT NULL,
	`base_unit` text NOT NULL,
	`unit_class` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade,
	CHECK (`unit_class` IN ('countable', 'measurable'))
);
--> statement-breakpoint
CREATE INDEX `inventory_items_home_idx` ON `inventory_items` (`home_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_home_name_base_unit_uq`
ON `inventory_items` (`home_id`, lower(trim(`name`)), trim(`base_unit`));
--> statement-breakpoint
CREATE TABLE `inventory_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity_base_units` real NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	`updated_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE restrict,
	CHECK (`owner_type` IN ('HOME', 'RESIDENT'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_balances_owner_item_uq`
ON `inventory_balances` (`owner_type`, `owner_id`, `item_id`);
--> statement-breakpoint
CREATE INDEX `inventory_balances_item_idx` ON `inventory_balances` (`item_id`);
--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`item_id` text NOT NULL,
	`transaction_type` text NOT NULL,
	`quantity_delta_base_units` real NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`note` text,
	`actor_user_id` text NOT NULL,
	`created_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CHECK (`owner_type` IN ('HOME', 'RESIDENT'))
);
--> statement-breakpoint
CREATE INDEX `inventory_transactions_owner_item_created_idx`
ON `inventory_transactions` (`owner_type`, `owner_id`, `item_id`, `created_at_utc_ms`);
--> statement-breakpoint
CREATE INDEX `inventory_transactions_source_idx`
ON `inventory_transactions` (`source_type`, `source_id`);
