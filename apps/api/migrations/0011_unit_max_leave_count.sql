-- 부대 최대 출타 인원을 비율(분자/분모)로 계산하지 않고 관리자가 직접 지정한다.
-- 비율만 쓰던 부대는 지금까지 계산되던 허용 인원을 그대로 옮긴다:
-- floor(기준 인원 × 분자 / 분모). 기준 인원은 관리자가 적어둔 headcount,
-- 없으면 앱 가입자 수였다(shared의 effectiveMemberCount와 같은 규칙).
-- 정수끼리의 SQLite 나눗셈은 절삭이라 양수 구간에서 floor와 같다.
UPDATE `units`
SET `max_leave_count` = CASE
    WHEN `max_leave_denominator` IS NULL OR `max_leave_denominator` <= 0 THEN 0
    ELSE (
      CASE
        WHEN `headcount` IS NOT NULL AND `headcount` > 0 THEN `headcount`
        ELSE (SELECT COUNT(*) FROM `users` WHERE `users`.`unit_id` = `units`.`id`)
      END
    ) * `max_leave_numerator` / `max_leave_denominator`
  END
WHERE `max_leave_count` IS NULL;
--> statement-breakpoint
-- SQLite에서는 컬럼 삭제와 NOT NULL 추가를 한 번에 못 하므로 테이블을 다시 만든다.
-- units를 참조하는 외래키가 없어 그대로 갈아끼워도 안전하다.
CREATE TABLE `units_new` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`max_leave_count` integer NOT NULL,
	`creator_id` text NOT NULL,
	`admin_id` text NOT NULL,
	`image_key` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
-- admin_id는 0002에서 nullable로 추가돼 이론상 NULL이 남을 수 있어 생성자로 메운다.
INSERT INTO `units_new`
  (`id`, `name`, `description`, `max_leave_count`, `creator_id`, `admin_id`, `image_key`, `created_at`)
SELECT `id`, `name`, `description`, COALESCE(`max_leave_count`, 0), `creator_id`,
       COALESCE(`admin_id`, `creator_id`), `image_key`, `created_at`
FROM `units`;
--> statement-breakpoint
DROP TABLE `units`;
--> statement-breakpoint
ALTER TABLE `units_new` RENAME TO `units`;
