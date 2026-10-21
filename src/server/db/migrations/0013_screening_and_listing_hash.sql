ALTER TABLE `applications` ADD `passed_screening_at` integer;--> statement-breakpoint
ALTER TABLE `comparisons` ADD `listing_hash` text;--> statement-breakpoint
-- Hand-added backfill: reaching Interviewing or Offer means it got past
-- screening, as of the last change at the latest. Everything else stays
-- unknown (null), which is what null means here.
UPDATE `applications` SET `passed_screening_at` = `updated_at` WHERE `status` IN ('interviewing', 'offer');
