-- "남은 휴가"에 외박 재원을 더할지. null이면 군종 기본값을 따른다(@leave/shared의
-- holdingsIncludeOvernightDefault) — 사용자가 한 번도 고르지 않았다는 사실을 남겨야
-- 군종을 바꿨을 때 새 군종의 기본값이 적용된다.
ALTER TABLE `users` ADD COLUMN `holdings_include_overnight` integer;
