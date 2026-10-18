-- Custom SQL migration file, put your code below! --
-- The "saved" application status is gone: a saved job is now a job with
-- no application. Carry each saved application's notes onto its job, then
-- delete the application row so the job shows up on the Saved jobs page.
UPDATE `jobs`
SET `notes` = (
  SELECT `applications`.`notes`
  FROM `applications`
  WHERE `applications`.`job_id` = `jobs`.`id`
    AND `applications`.`status` = 'saved'
  ORDER BY `applications`.`id` DESC
  LIMIT 1
)
WHERE `notes` IS NULL
  AND EXISTS (
    SELECT 1 FROM `applications`
    WHERE `applications`.`job_id` = `jobs`.`id`
      AND `applications`.`status` = 'saved'
  );
--> statement-breakpoint
DELETE FROM `applications` WHERE `status` = 'saved';
