CREATE TABLE `profile_bullets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `profile_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_bullets_entry_id_idx` ON `profile_bullets` (`entry_id`);--> statement-breakpoint
CREATE TABLE `profile_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`section` text NOT NULL,
	`title` text NOT NULL,
	`dates` text DEFAULT '' NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`latex_key` text,
	`source` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_entries_latex_key_unique` ON `profile_entries` (`latex_key`);--> statement-breakpoint
CREATE TABLE `profile_highlights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`source_job_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `profile_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`category` text,
	`aliases` text DEFAULT '[]' NOT NULL,
	`proficiency` text,
	`experience` text,
	`note` text,
	`source` text NOT NULL,
	`source_job_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_skills_name_key_unique` ON `profile_skills` (`name_key`);