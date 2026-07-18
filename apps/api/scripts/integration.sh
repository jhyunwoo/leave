#!/usr/bin/env bash
# Leave API 통합 시나리오: wrangler dev가 로컬(기본 http://localhost:8787)에서 떠 있어야 한다.
# 가입 3명 → 부대 생성(출타율 1/3) → 전원 가입 → 휴가 등록으로 초과 유발 → 달력 빨간 날 + 알림 확인
set -euo pipefail

API="${API:-http://localhost:8787}"
SUFFIX="$(date +%s)"
PASS="password123"

jqget() { python3 -c "import sys, json; data=json.load(sys.stdin); print(data$1)"; }

echo "== 1. 회원가입 3명 =="
declare -a TOKENS
for i in 1 2 3; do
  RES=$(curl -sS -X POST "$API/auth/signup" -H 'content-type: application/json' -d "{
    \"email\": \"soldier$i-$SUFFIX@test.com\",
    \"password\": \"$PASS\",
    \"name\": \"병사$i\",
    \"branch\": \"army\",
    \"enlistedAt\": \"2026-01-05\",
    \"dischargeAt\": \"2027-07-04\",
    \"rank\": \"private\",
    \"dataConsent\": true
  }")
  TOKENS[$i]=$(echo "$RES" | jqget "['token']")
  echo "  soldier$i 가입 완료, 계급: $(echo "$RES" | jqget "['user']['rankLabel']")"
done

echo "== 2. 부대 생성 (최대 출타율 1/3) =="
RES=$(curl -sS -X POST "$API/units" -H 'content-type: application/json' -H "Authorization: Bearer ${TOKENS[1]}" -d "{
  \"name\": \"제9999테스트대대-$SUFFIX\",
  \"description\": \"통합 테스트 부대\",
  \"maxLeaveNumerator\": 1,
  \"maxLeaveDenominator\": 3
}")
UNIT_ID=$(echo "$RES" | jqget "['unit']['id']")
echo "  unit=$UNIT_ID"

echo "== 3. 부대 검색 확인 =="
FOUND=$(curl -sS "$API/units?q=9999" -H "Authorization: Bearer ${TOKENS[2]}" | jqget "['units'][0]['name']")
echo "  검색 결과: $FOUND"

echo "== 4. 나머지 2명 부대 가입 =="
for i in 2 3; do
  curl -sS -X POST "$API/units/$UNIT_ID/join" -H "Authorization: Bearer ${TOKENS[$i]}" > /dev/null
done
MEMBERS=$(curl -sS "$API/units/$UNIT_ID/members" -H "Authorization: Bearer ${TOKENS[1]}" | jqget "['members'].__len__()")
echo "  부대원 수: $MEMBERS (기대: 3)"

echo "== 5. 휴가 등록: 3명 중 허용 인원은 floor(3/3)=1명 =="
RES=$(curl -sS -X POST "$API/leaves" -H 'content-type: application/json' -H "Authorization: Bearer ${TOKENS[1]}" -d '{
  "title": "연가", "startDate": "2026-08-10", "endDate": "2026-08-12"
}')
echo "  병사1 휴가: 초과일=$(echo "$RES" | jqget "['exceededDates']") (기대: [])"

RES=$(curl -sS -X POST "$API/leaves" -H 'content-type: application/json' -H "Authorization: Bearer ${TOKENS[2]}" -d '{
  "title": "위로휴가", "startDate": "2026-08-11", "endDate": "2026-08-13", "reason": "훈련 위로"
}')
EXCEEDED=$(echo "$RES" | jqget "['exceededDates']")
echo "  병사2 휴가: 초과일=$EXCEEDED (기대: 8/11, 8/12)"

echo "== 6. 달력에서 빨간 날 확인 =="
CAL=$(curl -sS "$API/units/$UNIT_ID/calendar?month=2026-08" -H "Authorization: Bearer ${TOKENS[3]}")
echo "$CAL" | python3 -c "
import sys, json
data = json.load(sys.stdin)
red = [d for d in data['days'] if d['exceeded']]
print('  빨간 날:', [(d['date'], d['count'], '허용', d['allowed']) for d in red])
assert [d['date'] for d in red] == ['2026-08-11', '2026-08-12'], '초과일 불일치'
assert len(data['leaves']) == 2, '달력 휴가 수 불일치'
print('  OK: 달력 검증 통과')
"

echo "== 7. 알림 확인 (초과일에 휴가 중인 병사1·2에게 생성) =="
for i in 1 2; do
  N=$(curl -sS "$API/notifications" -H "Authorization: Bearer ${TOKENS[$i]}")
  COUNT=$(echo "$N" | jqget "['unreadCount']")
  TITLE=$(echo "$N" | jqget "['notifications'][0]['title']")
  echo "  병사$i: unread=$COUNT, title=$TITLE"
done
N3=$(curl -sS "$API/notifications" -H "Authorization: Bearer ${TOKENS[3]}" | jqget "['unreadCount']")
echo "  병사3: unread=$N3 (기대: 0 — 휴가 없음)"

echo "== 8. 휴가 수정/삭제 =="
MINE=$(curl -sS "$API/leaves/mine" -H "Authorization: Bearer ${TOKENS[2]}")
LEAVE_ID=$(echo "$MINE" | jqget "['leaves'][0]['id']")
curl -sS -X PATCH "$API/leaves/$LEAVE_ID" -H 'content-type: application/json' -H "Authorization: Bearer ${TOKENS[2]}" -d '{
  "title": "위로휴가(변경)", "startDate": "2026-08-20", "endDate": "2026-08-21"
}' | jqget "['leave']['startDate']"
curl -sS -X DELETE "$API/leaves/$LEAVE_ID" -H "Authorization: Bearer ${TOKENS[2]}" | jqget "['ok']"
echo "  수정/삭제 OK"

echo "== 9. 인증 확인 =="
ME=$(curl -sS "$API/auth/me" -H "Authorization: Bearer ${TOKENS[1]}")
echo "  me: $(echo "$ME" | jqget "['user']['name']") / 부대: $(echo "$ME" | jqget "['unit']['name']")"
UNAUTH=$(curl -sS -o /dev/null -w '%{http_code}' "$API/auth/me")
echo "  토큰 없이 me: HTTP $UNAUTH (기대: 401)"

echo
echo "✅ 통합 시나리오 완료"
