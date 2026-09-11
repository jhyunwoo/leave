-- 외출을 주기 재원으로 만든다.
--
-- 그전까지 `outing`은 이름만 재원이었다. 종류로 고를 수는 있었지만 적립분이 0이라
-- 저장하면 "외출 잔여 0일보다 많이 사용할 수 없습니다"로 막혔다. 정기외박이 이미
-- 갖고 있던 주기 구조(regular_overnight_configs)를 외출에도 준다.
--
-- 갈래를 나누는 이유: 규정이 아니라 운용이 나눈다. 부대관리훈령은 외출을 정기·특별·
-- 공용으로 나눌 뿐이지만, 실제로 병사가 세는 단위는 "일과 후에 나가는 것"과 "휴일에
-- 나가는 것"이고 둘은 횟수가 따로 관리된다(육군 기준 평일 월 2회 · 주말 월 1회).
-- 한 주머니로 합치면 "이번 달 주말 외출을 썼는가"에 답할 수 없다.
--
-- 갈래를 컬럼이 아니라 행으로 나눈 것은 한쪽만 켜는 일이 흔하기 때문이다.
-- 해·공군의 주말 외출 주기는 공개 규정에 없어 기본이 꺼짐이다.
CREATE TABLE IF NOT EXISTS outing_configs (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  interval_days INTEGER,
  interval_months INTEGER,
  -- 외출에서는 **횟수**다. 외출은 당일 복귀라 한 번이 하루다.
  days_per_grant INTEGER,
  carry_over INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind),
  FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE leave_segments ADD COLUMN outing_kind TEXT;
--> statement-breakpoint
-- 이미 저장된 외출은 전부 평일로 읽는다. `segmentBalanceKey`가 빈 갈래를 평일로
-- 접으므로 이 백필이 없어도 결과는 같지만, 관리자 화면과 SQL 조회가 갈래를 눈으로
-- 확인할 수 있어야 해서 값을 채운다.
UPDATE leave_segments SET outing_kind = 'weekday'
WHERE category = 'outing' AND outing_kind IS NULL;
--> statement-breakpoint
-- 기존 사용자에게 군별 기본 주기를 심는다. 새로 가입하는 사용자는 온보딩이
-- 심으므로(lib/onboarding.ts) 여기서는 이미 있는 계정만 본다.
--
-- 주기 시작일은 **입대한 달의 1일**이다. "한 달에 두 번"은 달력의 달로 세는 것이
-- 실제 운영이라 주기도 달의 경계에 맞춘다 — 입대일 그대로를 쓰면 3/15~4/14 같은
-- 주기가 되어 부대가 세는 달과 어긋난다. 첫 적립은 한 주기 뒤라 입대 다음 달
-- 1일이 되는데, 신병교육 기간에는 외출이 없으니 그 편이 규정과도 맞다.
--
-- **외출 적립분을 이미 손으로 넣어 둔 사용자는 건드리지 않는다.** 주기를 켜는 순간
-- 그 재원은 주기에서 파생하고(cycleScoped) 적립분은 셈에서 빠진다. 직접 넣은 값이
-- 말없이 사라지는 것보다, 주기를 안 켜고 두었다가 사용자가 설정에서 켜는 편이 낫다.
INSERT INTO outing_configs
  (user_id, kind, enabled, start_date, interval_days, interval_months, days_per_grant, carry_over, updated_at)
SELECT u.id, 'weekday', 1,
       date(u.enlisted_at, 'start of month'), NULL, 1, 2, 0,
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM leave_grants g
  WHERE g.user_id = u.id AND g.balance_key IN ('outing', 'weekend_outing')
);
--> statement-breakpoint
-- 주말 외출은 육군만 켠다. 육군은 2012년 12월 외박제도 개정 이후 "분기별 1회 1박 2일
-- 외박 + 월 1회 외출"로 운영한다고 공개 자료가 말한다. 해·공군은 6주마다 2박 3일
-- 외박을 받고 그 사이 주말에 나가지만 몇 주마다인지가 공개 규정에 없어, 근거 없는
-- 숫자를 규정처럼 보이게 두는 대신 꺼 둔다(사용자가 부대 안내를 보고 켠다).
INSERT INTO outing_configs
  (user_id, kind, enabled, start_date, interval_days, interval_months, days_per_grant, carry_over, updated_at)
SELECT u.id, 'weekend',
       CASE u.branch WHEN 'army' THEN 1 ELSE 0 END,
       CASE u.branch WHEN 'army' THEN date(u.enlisted_at, 'start of month') ELSE NULL END,
       NULL,
       CASE u.branch WHEN 'army' THEN 1 ELSE NULL END,
       CASE u.branch WHEN 'army' THEN 1 ELSE NULL END,
       0,
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM leave_grants g
  WHERE g.user_id = u.id AND g.balance_key IN ('outing', 'weekend_outing')
);
