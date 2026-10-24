CREATE TABLE `interviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`application_id` integer NOT NULL,
	`at` integer NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`kind` text NOT NULL,
	`location` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interviews_user_at_idx` ON `interviews` (`user_id`,`at`);--> statement-breakpoint
ALTER TABLE `applications` ADD `followed_up_at` integer;