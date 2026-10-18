CREATE TABLE `comparisons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`resume_id` integer NOT NULL,
	`result_json` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comparisons_job_id_idx` ON `comparisons` (`job_id`);--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`version` integer NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resumes_version_unique` ON `resumes` (`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `resumes_one_active` ON `resumes` (`is_active`) WHERE "resumes"."is_active" = 1;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`applied_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_applications`("id", "job_id", "status", "applied_at", "notes", "created_at", "updated_at") SELECT "id", "job_id", "status", "applied_at", "notes", "created_at", "updated_at" FROM `applications`;--> statement-breakpoint
DROP TABLE `applications`;--> statement-breakpoint
ALTER TABLE `__new_applications` RENAME TO `applications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `jobs` ADD `notes` text;