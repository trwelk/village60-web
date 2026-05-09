UPDATE `invoices`
SET `issued_on` = `billing_period` || '-01'
WHERE (`issued_on` IS NULL OR `issued_on` = '')
  AND `billing_period` IS NOT NULL
  AND trim(`billing_period`) != ''
;
--> statement-breakpoint
UPDATE `invoices`
SET `issued_on` = strftime('%Y-%m-%d', `created_at_utc_ms` / 1000, 'unixepoch')
WHERE `issued_on` IS NULL OR `issued_on` = ''
;
--> statement-breakpoint
UPDATE `invoices`
SET `issued_on` = '1970-01-01'
WHERE `issued_on` IS NULL OR `issued_on` = ''
;
--> statement-breakpoint
ALTER TABLE `invoices` DROP COLUMN `billing_period`;
