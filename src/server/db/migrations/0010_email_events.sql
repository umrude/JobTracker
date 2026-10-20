CREATE TABLE `email_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`source` text NOT NULL,
	`gmail_message_id` text,
	`gmail_thread_id` text,
	`from_address` text,
	`from_name` text,
	`subject` text,
	`snippet` text,
	`received_at` integer,
	`application_id` integer,
	`match_method` text,
	`email_type` text,
	`confidence` real,
	`reason` text,
	`proposed_status` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`model` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_events_user_message_unique` ON `email_events` (`user_id`,`gmail_message_id`);--> statement-breakpoint
CREATE INDEX `email_events_user_state_idx` ON `email_events` (`user_id`,`state`);