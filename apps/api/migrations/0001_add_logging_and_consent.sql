CREATE TABLE `access_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`platform` text,
	`app_version` text,
	`user_agent` text,
	`ip` text,
	`country` text,
	`duration_ms` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_logs_user_idx` ON `access_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `access_logs_created_idx` ON `access_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `push_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`notification_id` text,
	`direction` text NOT NULL,
	`title` text,
	`body` text,
	`data_json` text,
	`status` text,
	`detail` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_logs_user_idx` ON `push_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `push_logs_created_idx` ON `push_logs` (`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `consented_at` text;