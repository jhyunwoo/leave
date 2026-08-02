ALTER TABLE `regular_overnight_configs` ADD COLUMN `start_date` text;--> statement-breakpoint
-- 적립 시작일은 실제로 첫 적립이 일어난 날이다. 적립 이력이 있으면 그 첫 적립일을,
-- 아직 한 번도 적립되지 않았으면 예정돼 있던 다음 적립일을 시작일로 삼는다.
-- 이렇게 두면 이미 받은 적립분이 그대로 유지되고 주기 경계도 지금과 같은 자리에 남는다.
UPDATE `regular_overnight_configs`
SET `start_date` = COALESCE(
	(SELECT MIN(g.`effective_date`)
	   FROM `leave_balance_grants` g
	  WHERE g.`user_id` = `regular_overnight_configs`.`user_id`
	    AND g.`balance_key` = 'regular_overnight'),
	`next_grant_date`
);--> statement-breakpoint
ALTER TABLE `regular_overnight_configs` DROP COLUMN `next_grant_date`;
