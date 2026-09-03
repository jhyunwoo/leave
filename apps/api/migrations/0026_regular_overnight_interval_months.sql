-- 육군 정기외박은 "분기(3개월)마다 1박 2일"이라 주기가 달 단위다.
-- 91일 같은 일수로 옮기면 네 주기(364일)마다 하루씩 앞당겨져 달력의 분기와 어긋나므로,
-- 일수 컬럼 옆에 달 단위 컬럼을 두고 둘 중 하나만 채운다.
-- 기존 행(해·공군의 42일)은 그대로 둔다 — interval_days가 있으면 지금과 같이 계산된다.
ALTER TABLE `regular_overnight_configs` ADD COLUMN `interval_months` integer;
