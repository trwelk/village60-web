ALTER TABLE `residents` ADD `public_token` text;
--> statement-breakpoint
UPDATE `residents` SET `public_token` = lower(hex(randomblob(16))) WHERE `public_token` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `residents_public_token_uq` ON `residents` (`public_token`);
