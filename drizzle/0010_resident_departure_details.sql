CREATE TABLE `resident_departure_details` (
	`resident_id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`departed_at_utc_ms` integer NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- 13a backfill: one details row per resident with status = 'departed' while legacy columns still exist.
-- Legacy gaps (documented):
--   * reason: NULL or whitespace-only -> stored as '' (no non-guessable text in DB).
--   * departure_at_utc_ms NULL -> use updated_at_utc_ms (approximate event time; true instant unknown).
INSERT INTO `resident_departure_details` (`resident_id`, `reason`, `departed_at_utc_ms`)
SELECT
	`id`,
	TRIM(COALESCE(`departure_reason`, '')),
	COALESCE(`departure_at_utc_ms`, `updated_at_utc_ms`)
FROM `residents`
WHERE `status` = 'departed';
--> statement-breakpoint
ALTER TABLE `residents` DROP COLUMN `departure_reason`;--> statement-breakpoint
ALTER TABLE `residents` DROP COLUMN `departure_at_utc_ms`;
