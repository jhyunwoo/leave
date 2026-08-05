-- 그룹 검색/UUID 가입 대신 고엔트로피 초대코드만 사용한다.
-- 원문 코드는 저장하지 않고 SHA-256 해시만 저장한다.
ALTER TABLE `units` ADD `reference_member_total` integer;
--> statement-breakpoint
ALTER TABLE `units` ADD `last_total_updated_at` text;
--> statement-breakpoint
CREATE TABLE `unit_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`max_uses` integer NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`revoked_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_invites_code_hash_unique` ON `unit_invites` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `unit_invites_unit_idx` ON `unit_invites` (`unit_id`);
--> statement-breakpoint
CREATE INDEX `unit_invites_expires_idx` ON `unit_invites` (`expires_at`);
--> statement-breakpoint
-- 승인 대기형 UUID 가입 경로는 폐기한다. 기존 대기 신청에는 소속 권한이 없으므로 이관하지 않는다.
DROP TABLE `unit_join_requests`;
--> statement-breakpoint
-- 접속 로그에서 네트워크 식별자와 원문 User-Agent를 물리적으로 제거한다.
CREATE TABLE `access_logs_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`platform` text,
	`app_version` text,
	`duration_ms` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `access_logs_new`
	(`id`, `user_id`, `method`, `path`, `status`, `platform`, `app_version`, `duration_ms`, `created_at`)
SELECT `id`, `user_id`, `method`, `path`, `status`, `platform`, `app_version`, `duration_ms`, `created_at`
FROM `access_logs`;
--> statement-breakpoint
DROP TABLE `access_logs`;
--> statement-breakpoint
ALTER TABLE `access_logs_new` RENAME TO `access_logs`;
--> statement-breakpoint
CREATE INDEX `access_logs_user_idx` ON `access_logs` (`user_id`);
--> statement-breakpoint
CREATE INDEX `access_logs_created_idx` ON `access_logs` (`created_at`);
--> statement-breakpoint
-- 푸시 로그는 전달 상태와 알림 참조만 보존하고 메시지·데이터·오류 원문을 제거한다.
CREATE TABLE `push_logs_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`notification_id` text,
	`direction` text NOT NULL,
	`status` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `push_logs_new`
	(`id`, `user_id`, `notification_id`, `direction`, `status`, `created_at`)
SELECT `id`, `user_id`, `notification_id`, `direction`, `status`, `created_at`
FROM `push_logs`;
--> statement-breakpoint
DROP TABLE `push_logs`;
--> statement-breakpoint
ALTER TABLE `push_logs_new` RENAME TO `push_logs`;
--> statement-breakpoint
CREATE INDEX `push_logs_user_idx` ON `push_logs` (`user_id`);
--> statement-breakpoint
CREATE INDEX `push_logs_created_idx` ON `push_logs` (`created_at`);
