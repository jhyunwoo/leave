CREATE TABLE `unit_join_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_join_requests_user_id_unique` ON `unit_join_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `unit_join_requests_unit_idx` ON `unit_join_requests` (`unit_id`);--> statement-breakpoint
ALTER TABLE `units` ADD `admin_id` text;--> statement-breakpoint
UPDATE `units` SET `admin_id` = `creator_id` WHERE `admin_id` IS NULL;--> statement-breakpoint
ALTER TABLE `units` ADD `headcount` integer;--> statement-breakpoint
ALTER TABLE `units` ADD `image_key` text;