-- 알림 종류별 on/off. 행이 없으면 전부 켜진 것으로 본다(기존 동작 유지).
CREATE TABLE `user_notification_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`overage` integer DEFAULT 1 NOT NULL,
	`blackout` integer DEFAULT 1 NOT NULL,
	`unit_notice` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
