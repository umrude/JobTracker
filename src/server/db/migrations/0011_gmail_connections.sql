CREATE TABLE `gmail_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`email` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`scope` text NOT NULL,
	`needs_reconnect` integer DEFAULT false NOT NULL,
	`sync_start_at` integer,
	`history_id` text,
	`last_synced_at` integer,
	`connected_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_connections_user_unique` ON `gmail_connections` (`user_id`);