CREATE TABLE `user_additional_homes` (
	`user_id` text NOT NULL,
	`home_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `home_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `users` ADD `primary_home_id` text REFERENCES homes(id);