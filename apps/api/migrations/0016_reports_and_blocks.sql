-- 자유 입력(그룹 별칭·설명, 참여자 별칭)이 있는 이상 신고·차단 경로가 필요하다.
-- Apple App Review Guideline 1.2 / Google Play UGC 정책.
CREATE TABLE `content_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`detail` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_reports_status_idx` ON `content_reports` (`status`);
--> statement-breakpoint
CREATE INDEX `content_reports_target_idx` ON `content_reports` (`target_type`,`target_id`);
--> statement-breakpoint
-- 차단은 목록 표시에만 영향을 준다. 출타 집계에서는 빼지 않는다 — 정확도가 무너진다.
CREATE TABLE `user_blocks` (
	`user_id` text NOT NULL,
	`blocked_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `blocked_user_id`)
);
--> statement-breakpoint
CREATE INDEX `user_blocks_user_idx` ON `user_blocks` (`user_id`);
