-- rate limit 카운터를 KV에서 D1로 옮긴다.
--
-- KV에는 원자적 증가가 없어 "읽고 더해 쓰기"가 동시 요청에서 겹쳤다. 같이 도착한
-- 요청들이 모두 같은 값을 읽고 같은 값을 써서 카운터가 한 번만 올라갔다 — 정밀하지
-- 않은 정도가 아니라 상한이 사실상 무력해지는 것이고, 6자 초대코드의 안전이
-- `3회/15분`에 기대고 있어서(routes/units.ts) 그 자리에서는 실제 보안 구멍이었다.
--
-- D1의 `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING`은 한 문장이라
-- 원자적이다. 창 번호가 키에 들어 있어 지난 창의 행은 다시 읽히지 않고, 정리는
-- 보관 기간 cron이 맡는다(lib/retention.ts).
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_counters_expires_idx
  ON rate_limit_counters (expires_at);
