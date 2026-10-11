-- 운영 공지 수신 설정 — 관리자 전체 발송(apps/admin)을 사용자가 끌 수 있게 한다.
--
-- 기본값은 다른 종류와 같이 1(받음)이다. 홍보성 내용을 보낼 때는 App Store 4.5.4와
-- 정보통신망법이 사전 동의를 요구하므로, 이 설정만으로는 그 동의를 대신하지 못한다.
ALTER TABLE `user_notification_prefs` ADD COLUMN `announcement` integer DEFAULT 1 NOT NULL;
