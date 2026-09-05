-- 친구 관련 알림 두 종류를 종류별로 끌 수 있게 한다.
--
-- 기본값이 1(받음)인 이유는 기존 세 종류와 같다 — 설정 행이 아예 없는 사용자가
-- 대다수이고, 그 사람들도 친구 요청은 받아야 기능이 성립한다. 끄고 싶은 사람은
-- 알림 설정 화면에서 끈다.
--
-- friend_leave는 발송량이 가장 큰 종류다(친구 수만큼 곱해진다). 그래서 인앱
-- 알림함에만 남기는 것이 아니라 이 스위치로 반드시 끌 수 있어야 한다.
ALTER TABLE `user_notification_prefs` ADD COLUMN `friend_request` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_notification_prefs` ADD COLUMN `friend_leave` integer DEFAULT 1 NOT NULL;
