-- Hand-edited: drizzle-kit generated the job_id column without ON DELETE
-- CASCADE (as in 0005 and 0009). Deleting a saved job deletes suggestions
-- about it, like every other child of jobs.
ALTER TABLE `email_events` ADD `job_id` integer REFERENCES jobs(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `email_events` ADD `extracted_company` text;--> statement-breakpoint
ALTER TABLE `email_events` ADD `extracted_role` text;
