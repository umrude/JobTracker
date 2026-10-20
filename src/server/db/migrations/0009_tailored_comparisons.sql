-- Hand-edited: drizzle-kit generated this without ON DELETE cascade (as in
-- 0005). SQLite allows adding a nullable foreign-key column with a NULL
-- default, cascade included, so no table rebuild is needed.
ALTER TABLE `comparisons` ADD `tailoring_id` integer REFERENCES tailored_resumes(id) ON DELETE cascade;
