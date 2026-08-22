CREATE TABLE `friendships` (
	`user_a_id` text NOT NULL,
	`user_b_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`accepted_at` text,
	PRIMARY KEY(`user_a_id`, `user_b_id`),
	FOREIGN KEY (`user_a_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_b_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "friendships_order_check" CHECK(`friendships`.`user_a_id` < `friendships`.`user_b_id`),
	CONSTRAINT "friendships_requester_check" CHECK(`friendships`.`requested_by_user_id` = `friendships`.`user_a_id` OR `friendships`.`requested_by_user_id` = `friendships`.`user_b_id`),
	CONSTRAINT "friendships_acceptance_check" CHECK((`friendships`.`status` = 'pending' AND `friendships`.`accepted_at` IS NULL) OR (`friendships`.`status` = 'accepted' AND `friendships`.`accepted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `friendships_a_status_idx` ON `friendships` (`user_a_id`,`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `friendships_b_status_idx` ON `friendships` (`user_b_id`,`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `personal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "personal_events_dates_check" CHECK(`personal_events`.`start_date` <= `personal_events`.`end_date`)
);
--> statement-breakpoint
CREATE INDEX `personal_events_owner_start_idx` ON `personal_events` (`owner_user_id`,`start_date`);
