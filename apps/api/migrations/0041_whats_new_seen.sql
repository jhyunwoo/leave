-- 마지막으로 본 새 기능 안내의 id(@leave/shared의 LATEST_WHATS_NEW). 계정에 두어야
-- 웹에서 본 안내가 앱에서 다시 뜨지 않는다. null이면 아직 아무 안내도 보지 않았다.
ALTER TABLE `users` ADD COLUMN `seen_whats_new_id` text;
