-- Hand-written (drizzle-kit's generated version can't run on SQLite: it
-- ADDs NOT NULL foreign-key columns without defaults, and drops ON DELETE
-- CASCADE). The snapshot in meta/ is drizzle's, so future migrations
-- generate against the right schema. See docs/multi-user.md.
--
-- Every table gets a user_id. SQLite can't add a NOT NULL foreign key to
-- an existing table, so each table is rebuilt: create, copy, drop, rename.
--
-- Order matters. Drizzle runs a migration inside a transaction, where
-- PRAGMA foreign_keys=OFF is ignored, and better-sqlite3 enforces foreign
-- keys. Dropping a parent table (jobs) would then fire ON DELETE CASCADE
-- and delete its children's rows. So:
--   1. New child tables reference the NEW parents (__new_jobs, ...).
--   2. Old tables are dropped children first, so no cascade has anything
--      to delete.
--   3. New tables are renamed into place; SQLite rewrites the children's
--      references to the renamed parents.
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
-- The "unclaimed owner": owns all data from before users existed, and is
-- claimed (given an email) by the first sign-in. Only created if there is
-- existing data, so a fresh database (like the demo's) starts with no users.
INSERT INTO `users` (`id`, `email`)
SELECT 1, NULL
WHERE EXISTS (SELECT 1 FROM `jobs`)
   OR EXISTS (SELECT 1 FROM `resumes`)
   OR EXISTS (SELECT 1 FROM `profile_skills`)
   OR EXISTS (SELECT 1 FROM `profile_entries`)
   OR EXISTS (SELECT 1 FROM `profile_highlights`);--> statement-breakpoint
CREATE TABLE `__new_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`listing_text` text,
	`source` text,
	`notes` text,
	`saved_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_jobs` (`id`, `user_id`, `company`, `title`, `url`, `listing_text`, `source`, `notes`, `saved_at`)
SELECT `id`, 1, `company`, `title`, `url`, `listing_text`, `source`, `notes`, `saved_at` FROM `jobs`;--> statement-breakpoint
CREATE TABLE `__new_resumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`text` text NOT NULL,
	`latex_source` text,
	`version` integer NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_resumes` (`id`, `user_id`, `text`, `latex_source`, `version`, `is_active`, `created_at`)
SELECT `id`, 1, `text`, `latex_source`, `version`, `is_active`, `created_at` FROM `resumes`;--> statement-breakpoint
CREATE TABLE `__new_profile_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`section` text NOT NULL,
	`title` text NOT NULL,
	`dates` text DEFAULT '' NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`latex_key` text,
	`source` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_profile_entries` (`id`, `user_id`, `section`, `title`, `dates`, `subtitle`, `detail`, `latex_key`, `source`, `sort_order`, `created_at`)
SELECT `id`, 1, `section`, `title`, `dates`, `subtitle`, `detail`, `latex_key`, `source`, `sort_order`, `created_at` FROM `profile_entries`;--> statement-breakpoint
CREATE TABLE `__new_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`job_id` integer NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`applied_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `__new_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_applications` (`id`, `user_id`, `job_id`, `status`, `applied_at`, `notes`, `created_at`, `updated_at`)
SELECT `id`, 1, `job_id`, `status`, `applied_at`, `notes`, `created_at`, `updated_at` FROM `applications`;--> statement-breakpoint
CREATE TABLE `__new_comparisons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`job_id` integer NOT NULL,
	`resume_id` integer NOT NULL,
	`result_json` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `__new_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_id`) REFERENCES `__new_resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_comparisons` (`id`, `user_id`, `job_id`, `resume_id`, `result_json`, `model`, `created_at`)
SELECT `id`, 1, `job_id`, `resume_id`, `result_json`, `model`, `created_at` FROM `comparisons`;--> statement-breakpoint
CREATE TABLE `__new_profile_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_job_id`) REFERENCES `__new_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_profile_skills` (`id`, `user_id`, `name`, `name_key`, `category`, `aliases`, `proficiency`, `experience`, `note`, `source`, `source_job_id`, `sort_order`, `created_at`)
SELECT `id`, 1, `name`, `name_key`, `category`, `aliases`, `proficiency`, `experience`, `note`, `source`, `source_job_id`, `sort_order`, `created_at` FROM `profile_skills`;--> statement-breakpoint
CREATE TABLE `__new_profile_bullets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`entry_id` integer NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `__new_profile_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_profile_bullets` (`id`, `user_id`, `entry_id`, `text`, `source`, `sort_order`, `created_at`)
SELECT `id`, 1, `entry_id`, `text`, `source`, `sort_order`, `created_at` FROM `profile_bullets`;--> statement-breakpoint
CREATE TABLE `__new_profile_highlights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`source_job_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_job_id`) REFERENCES `__new_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_profile_highlights` (`id`, `user_id`, `text`, `source`, `source_job_id`, `sort_order`, `created_at`)
SELECT `id`, 1, `text`, `source`, `source_job_id`, `sort_order`, `created_at` FROM `profile_highlights`;--> statement-breakpoint
DROP TABLE `comparisons`;--> statement-breakpoint
DROP TABLE `applications`;--> statement-breakpoint
DROP TABLE `profile_bullets`;--> statement-breakpoint
DROP TABLE `profile_skills`;--> statement-breakpoint
DROP TABLE `profile_highlights`;--> statement-breakpoint
DROP TABLE `profile_entries`;--> statement-breakpoint
DROP TABLE `resumes`;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
ALTER TABLE `__new_resumes` RENAME TO `resumes`;--> statement-breakpoint
ALTER TABLE `__new_profile_entries` RENAME TO `profile_entries`;--> statement-breakpoint
ALTER TABLE `__new_applications` RENAME TO `applications`;--> statement-breakpoint
ALTER TABLE `__new_comparisons` RENAME TO `comparisons`;--> statement-breakpoint
ALTER TABLE `__new_profile_skills` RENAME TO `profile_skills`;--> statement-breakpoint
ALTER TABLE `__new_profile_bullets` RENAME TO `profile_bullets`;--> statement-breakpoint
ALTER TABLE `__new_profile_highlights` RENAME TO `profile_highlights`;--> statement-breakpoint
CREATE INDEX `jobs_user_id_idx` ON `jobs` (`user_id`);--> statement-breakpoint
CREATE INDEX `applications_user_id_idx` ON `applications` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `resumes_user_version_unique` ON `resumes` (`user_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `resumes_user_one_active` ON `resumes` (`user_id`) WHERE "resumes"."is_active" = 1;--> statement-breakpoint
CREATE INDEX `comparisons_job_id_idx` ON `comparisons` (`job_id`);--> statement-breakpoint
CREATE INDEX `comparisons_user_id_idx` ON `comparisons` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_skills_user_name_key_unique` ON `profile_skills` (`user_id`,`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_entries_user_latex_key_unique` ON `profile_entries` (`user_id`,`latex_key`);--> statement-breakpoint
CREATE INDEX `profile_bullets_entry_id_idx` ON `profile_bullets` (`entry_id`);--> statement-breakpoint
CREATE INDEX `profile_bullets_user_id_idx` ON `profile_bullets` (`user_id`);--> statement-breakpoint
CREATE INDEX `profile_highlights_user_id_idx` ON `profile_highlights` (`user_id`);
