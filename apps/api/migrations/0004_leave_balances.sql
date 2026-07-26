CREATE TABLE `leave_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`leave_id` text NOT NULL,
	`category` text NOT NULL,
	`days` integer NOT NULL,
	`overnight_kind` text,
	FOREIGN KEY (`leave_id`) REFERENCES `leaves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `leave_allocations_leave_idx` ON `leave_allocations` (`leave_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `leave_allocations_source_unique` ON `leave_allocations` (`leave_id`,`category`,`overnight_kind`);--> statement-breakpoint
CREATE TABLE `leave_balance_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`balance_key` text NOT NULL,
	`days` integer NOT NULL,
	`effective_date` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_balance_grants_due_unique` ON `leave_balance_grants` (`user_id`,`balance_key`,`effective_date`);--> statement-breakpoint
CREATE INDEX `leave_balance_grants_user_idx` ON `leave_balance_grants` (`user_id`);--> statement-breakpoint
CREATE TABLE `regular_overnight_configs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`next_grant_date` text,
	`interval_days` integer,
	`days_per_grant` integer,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_leave_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`balance_key` text NOT NULL,
	`adjustment_days` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_leave_balances_user_key_unique` ON `user_leave_balances` (`user_id`,`balance_key`);--> statement-breakpoint
CREATE INDEX `user_leave_balances_user_idx` ON `user_leave_balances` (`user_id`);
--> statement-breakpoint
INSERT INTO `leave_allocations` (`id`, `leave_id`, `category`, `days`, `overnight_kind`)
SELECT lower(hex(randomblob(16))), `id`, 'other',
       CAST(julianday(`end_date`) - julianday(`start_date`) + 1 AS integer), NULL
FROM `leaves`;
--> statement-breakpoint
INSERT INTO `user_leave_balances` (`id`, `user_id`, `balance_key`, `adjustment_days`, `updated_at`)
SELECT lower(hex(randomblob(16))), `id`, 'annual',
       CASE `branch` WHEN 'army' THEN 24 WHEN 'navy' THEN 27 ELSE 28 END,
       CURRENT_TIMESTAMP
FROM `users`;
--> statement-breakpoint
INSERT INTO `user_leave_balances` (`id`, `user_id`, `balance_key`, `adjustment_days`, `updated_at`)
SELECT lower(hex(randomblob(16))), u.`id`, 'other',
       COALESCE(SUM(CAST(julianday(l.`end_date`) - julianday(l.`start_date`) + 1 AS integer)), 0),
       CURRENT_TIMESTAMP
FROM `users` u
LEFT JOIN `leaves` l ON l.`user_id` = u.`id`
GROUP BY u.`id`;
