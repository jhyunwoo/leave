-- 친구에게 보여줄 항목(복무율·남은 일과일·휴가 일정)을 본인이 고르게 한다.
--
-- 행이 없으면 전부 공유한 것으로 본다. 이 표가 생기기 전에는 수락한 친구에게
-- 세 항목이 모두 보였고, 설정을 건드리지 않은 사람에게는 그 동작이 그대로 이어져야
-- 한다. 기본값 1도 같은 이유다 — 한 항목만 보낸 PATCH가 행을 처음 만들 때 나머지는
-- 공유 상태로 남는다.
CREATE TABLE `user_friend_sharing` (
	`user_id` text PRIMARY KEY NOT NULL,
	`service_progress` integer DEFAULT 1 NOT NULL,
	`duty_days` integer DEFAULT 1 NOT NULL,
	`leave_schedule` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
