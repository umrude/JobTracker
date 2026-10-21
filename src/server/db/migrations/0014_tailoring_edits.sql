-- Hand-edited: drizzle-kit generated revised_from_id without its ON DELETE
-- rule (as in 0005, 0009, and 0012). Deleting a draft leaves its revisions,
-- just without the link back.
ALTER TABLE `tailored_resumes` ADD `user_edits_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tailored_resumes` ADD `decisions_json` text;--> statement-breakpoint
ALTER TABLE `tailored_resumes` ADD `revised_from_id` integer REFERENCES tailored_resumes(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `tailored_resumes` ADD `revision_note` text;
