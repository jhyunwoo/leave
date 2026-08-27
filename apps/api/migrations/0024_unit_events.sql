CREATE TABLE `unit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`title` text NOT NULL,
	`is_holiday` integer DEFAULT false NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`details` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "unit_events_dates_check" CHECK(`unit_events`.`start_date` <= `unit_events`.`end_date`)
);
--> statement-breakpoint
CREATE INDEX `unit_events_unit_start_idx` ON `unit_events` (`unit_id`,`start_date`);
