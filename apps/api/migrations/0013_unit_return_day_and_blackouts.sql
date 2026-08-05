-- 복귀일을 출타로 셀지는 부대마다 다르다. 하드코딩하면 어느 한쪽은 항상 틀린다.
-- 기존 동작(복귀일도 출타로 계산)을 기본값으로 둬 마이그레이션이 숫자를 바꾸지 않게 한다.
ALTER TABLE `units` ADD `return_day_counts` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- 검열·훈련처럼 출타율과 무관하게 휴가가 제한될 수 있는 기간.
CREATE TABLE `unit_blackouts` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`reason` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `unit_blackouts_unit_idx` ON `unit_blackouts` (`unit_id`);
--> statement-breakpoint
CREATE INDEX `unit_blackouts_dates_idx` ON `unit_blackouts` (`start_date`,`end_date`);
