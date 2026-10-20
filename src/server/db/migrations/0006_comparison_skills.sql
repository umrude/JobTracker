CREATE TABLE `comparison_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`comparison_id` integer NOT NULL,
	`skill_key` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comparison_skills_comparison_id_idx` ON `comparison_skills` (`comparison_id`);--> statement-breakpoint
CREATE INDEX `comparison_skills_user_skill_idx` ON `comparison_skills` (`user_id`,`skill_key`);