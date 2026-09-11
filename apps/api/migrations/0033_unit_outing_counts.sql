-- 외출을 출타 인원으로 셀지는 부대마다 다르다. 일과 후 외출을 "하루 최대 출타 인원"
-- 한도에 넣는 부대도, 넣지 않는 부대도 있어 하드코딩하면 어느 한쪽은 언제나 틀린다.
-- 0013의 return_day_counts와 같은 이유이고 같은 모양이다.
--
-- 기존 동작(외출도 출타로 계산)을 기본값으로 둬 마이그레이션이 숫자를 바꾸지 않게 한다.
ALTER TABLE `units` ADD `outing_counts` integer DEFAULT 1 NOT NULL;
