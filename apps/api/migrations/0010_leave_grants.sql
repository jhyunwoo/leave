-- 휴가를 "받은 건"별로 담는다. 같은 재원이라도 만기가 다르면 다른 행이다
-- (포상휴가 3일 ~8/31 + 포상휴가 2일 만기 없음). 재원 총량은 이 행들의 합이다.
-- 0004의 leave_balance_grants가 (user_id, balance_key, effective_date) 유니크였던 탓에
-- 같은 날 받은 만기 다른 두 건을 담지 못했으므로, 여기서는 유니크 인덱스를 두지 않는다.
CREATE TABLE `leave_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`balance_key` text NOT NULL,
	`days` integer NOT NULL,
	`granted_on` text,
	`expires_on` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `leave_grants_user_idx` ON `leave_grants` (`user_id`);--> statement-breakpoint
CREATE INDEX `leave_grants_user_key_idx` ON `leave_grants` (`user_id`,`balance_key`);--> statement-breakpoint
-- 기존 총량(user_leave_balances.adjustment_days)을 "만기 없는 기본 적립분" 한 건으로 옮긴다.
-- 0일짜리는 옮기지 않는다 — 적립분이 없다는 것이 곧 0일이다.
-- 자동 적립을 쓰는 사용자의 정기외박은 주기 설정에서 파생하므로 옮기지 않는다(0009와 같은 이유).
-- created_at은 앱과 같은 ISO-8601 형식으로 쓴다. 이 값이 배분 동점 처리 키라
-- CURRENT_TIMESTAMP('YYYY-MM-DD HH:MM:SS')와 섞이면 정렬이 ASCII 우연에 좌우된다.
INSERT INTO `leave_grants`
  (`id`, `user_id`, `balance_key`, `days`, `granted_on`, `expires_on`, `note`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), b.`user_id`, b.`balance_key`, b.`adjustment_days`,
       NULL, NULL, NULL,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM `user_leave_balances` b
LEFT JOIN `regular_overnight_configs` c ON c.`user_id` = b.`user_id`
WHERE b.`adjustment_days` > 0
  AND NOT (
    b.`balance_key` = 'regular_overnight'
    AND c.`enabled` = 1
    AND c.`start_date` IS NOT NULL
    AND c.`interval_days` IS NOT NULL
    AND c.`days_per_grant` IS NOT NULL
  );
--> statement-breakpoint
-- 한 번도 잔여량 화면을 열지 않아 user_leave_balances 행이 아예 없는 사용자에게
-- 군별 기본 연가를 심는다(지연 시딩하던 ensureLeaveBalances를 대체한다).
INSERT INTO `leave_grants`
  (`id`, `user_id`, `balance_key`, `days`, `granted_on`, `expires_on`, `note`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), u.`id`, 'annual',
       CASE u.`branch` WHEN 'army' THEN 24 WHEN 'navy' THEN 27 ELSE 28 END,
       NULL, NULL, NULL,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM `users` u
WHERE NOT EXISTS (SELECT 1 FROM `user_leave_balances` b WHERE b.`user_id` = u.`id`);
