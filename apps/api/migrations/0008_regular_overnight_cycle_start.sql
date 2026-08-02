-- start_date의 뜻이 "첫 적립일"에서 "주기 시작일"로 바뀐다.
-- 첫 적립은 이제 주기 시작일이 아니라 한 주기를 채운 뒤(start_date + interval_days)에 이뤄지므로,
-- 기존 값을 한 주기 앞으로 당겨야 지금까지 쌓인 적립 이력이 그대로 새 일정과 맞아떨어진다.
UPDATE `regular_overnight_configs`
SET `start_date` = date(`start_date`, '-' || `interval_days` || ' days')
WHERE `start_date` IS NOT NULL
  AND `interval_days` IS NOT NULL;
