CREATE TABLE `leave_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`leave_id` text NOT NULL,
	`category` text NOT NULL,
	`overnight_kind` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`days` integer NOT NULL,
	FOREIGN KEY (`leave_id`) REFERENCES `leaves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `leave_segments_leave_idx` ON `leave_segments` (`leave_id`);--> statement-breakpoint
CREATE INDEX `leave_segments_dates_idx` ON `leave_segments` (`start_date`,`end_date`);--> statement-breakpoint
INSERT INTO `leave_segments` (`id`, `leave_id`, `category`, `overnight_kind`, `start_date`, `end_date`, `days`)
SELECT lower(hex(randomblob(16))),
       a.`leave_id`,
       a.`category`,
       a.`overnight_kind`,
       date(l.`start_date`, '+' || (SUM(a.`days`) OVER w - a.`days`) || ' day'),
       date(l.`start_date`, '+' || (SUM(a.`days`) OVER w - 1) || ' day'),
       a.`days`
FROM `leave_allocations` a
JOIN `leaves` l ON l.`id` = a.`leave_id`
WINDOW w AS (
  PARTITION BY a.`leave_id`
  ORDER BY CASE a.`category`
             WHEN 'annual' THEN 1
             WHEN 'award' THEN 2
             WHEN 'compensation' THEN 3
             WHEN 'consolation' THEN 4
             WHEN 'petition' THEN 5
             WHEN 'sick' THEN 6
             WHEN 'overnight' THEN CASE a.`overnight_kind` WHEN 'regular' THEN 7 ELSE 8 END
             WHEN 'outing' THEN 9
             ELSE 10
           END,
           a.`overnight_kind`
  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
);
--> statement-breakpoint
DROP TABLE `leave_allocations`;
