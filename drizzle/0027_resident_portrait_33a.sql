ALTER TABLE `residents` ADD `portrait_stored_relative_path` text;
--> statement-breakpoint
ALTER TABLE `residents` ADD `portrait_content_type` text;
--> statement-breakpoint
ALTER TABLE `residents` ADD `portrait_size_bytes` integer;
--> statement-breakpoint
ALTER TABLE `residents` ADD `portrait_updated_at_utc_ms` integer;
