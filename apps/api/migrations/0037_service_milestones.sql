-- 복무 기념일 알림 — 전역 D-n(600·500·400·300·200·100·50·10일 전, 하루 전)과
-- 진급(일병·상병·병장). 내 기념일과 친구의 기념일을 각각 받는다.
--
-- 수신 설정 네 개의 기본값이 1(받음)인 이유는 기존 종류와 같다 — 설정 행이 없는
-- 사용자가 대다수이고, 축하 알림은 끄기 전까지 받는 편이 기능의 뜻에 맞는다.
ALTER TABLE `user_notification_prefs` ADD COLUMN `discharge_countdown` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_notification_prefs` ADD COLUMN `promotion` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_notification_prefs` ADD COLUMN `friend_discharge_countdown` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_notification_prefs` ADD COLUMN `friend_promotion` integer DEFAULT 1 NOT NULL;--> statement-breakpoint

-- 알림함이 내 기념일이면 축하 화면으로, 친구의 기념일이면 그 친구로 잇는다.
ALTER TABLE `notifications` ADD COLUMN `milestone_json` text;--> statement-breakpoint

-- 이미 보낸 기념일. cron이 하루에 여러 번 돌아도 한 번만 알리게 하는 장부다.
CREATE TABLE `milestone_deliveries` (
	`user_id` text NOT NULL,
	`milestone_key` text NOT NULL,
	`occurred_on` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `milestone_key`, `occurred_on`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
