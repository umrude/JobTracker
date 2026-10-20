CREATE TABLE `tailored_resumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`job_id` integer NOT NULL,
	`resume_id` integer NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`proposal_json` text NOT NULL,
	`issues_json` text NOT NULL,
	`approved_json` text,
	`snapshot_json` text,
	`pages` integer,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`approved_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tailored_resumes_user_job_version_unique` ON `tailored_resumes` (`user_id`,`job_id`,`version`);