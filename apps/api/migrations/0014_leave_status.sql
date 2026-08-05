-- 희망과 확정을 구분하지 못하면 남의 초안을 확정으로 오해해 계획이 어긋난다.
-- draft는 나만 보이고 집계에서 빠지며, shared 이후만 익명으로 집계에 들어간다.
-- 기존 일정은 이미 공유된 계획이므로 shared로 채운다.
ALTER TABLE `leaves` ADD `status` text DEFAULT 'shared' NOT NULL;
--> statement-breakpoint
CREATE INDEX `leaves_status_idx` ON `leaves` (`status`);
