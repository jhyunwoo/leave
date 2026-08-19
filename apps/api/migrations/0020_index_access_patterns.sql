-- 인덱스를 실제 접근 패턴에 맞춘다. 근거는 EXPLAIN QUERY PLAN과 시드 데이터(사용자 1,290명,
-- 휴가 25,800건, 접속 로그 300,000건) 위에서 측정한 값이다.
--
-- 공통 문제: "user_id로 좁히고 created_at/이름으로 정렬"하는 목록 쿼리가 전부
-- USE TEMP B-TREE FOR ORDER BY로 끝났다. 정렬 대상이 LIMIT 50이 아니라 그 사용자의
-- 행 전부라, 행이 쌓일수록 읽는 양이 선형으로 늘어난다. 정렬 컬럼을 인덱스 뒤에 붙여
-- 정렬 자체를 없앤다.
--
-- 표별 인덱스 "개수"는 늘리지 않는다(교체이거나 삭제다). 쓰기 비용이 늘지 않는 것이 조건이었다.

-- 접속 로그: 요청당 1행이 쌓이는 표라 사용자별 목록이 가장 빨리 나빠진다.
-- GET /auth/activity 기준 1.585ms → 0.115ms (-93%), TEMP B-TREE 제거.
DROP INDEX `access_logs_user_idx`;--> statement-breakpoint
CREATE INDEX `access_logs_user_created_idx` ON `access_logs` (`user_id`,`created_at`);--> statement-breakpoint

-- 알림함 목록(GET /notifications): 0.237ms → 0.157ms (-34%), TEMP B-TREE 제거.
DROP INDEX `notifications_user_idx`;--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint

-- 푸시 로그(GET /auth/activity): 0.074ms → 0.042ms (-43%), TEMP B-TREE 제거.
DROP INDEX `push_logs_user_idx`;--> statement-breakpoint
CREATE INDEX `push_logs_user_created_idx` ON `push_logs` (`user_id`,`created_at`);--> statement-breakpoint

-- 휴가: GET /leaves/mine의 정렬을 없애고, 달력의 기간 조건이 인덱스 범위로 내려간다
-- (SEARCH ... user_id=? AND start_date<?). user_id 단독 인덱스는 이 인덱스의 접두사라 함께 지운다.
DROP INDEX `leaves_user_idx`;--> statement-breakpoint
CREATE INDEX `leaves_user_start_idx` ON `leaves` (`user_id`,`start_date`);--> statement-breakpoint

-- status 단독 인덱스는 어떤 쿼리 계획에서도 선택되지 않았다. 값이 7종뿐이고 그중
-- 'shared'가 대부분이라 선택도가 없다. 병합 후보 조회(user_id + status)도
-- leaves_user_start_idx를 쓴다. 남겨 두면 휴가 쓰기마다 갱신 비용만 든다.
DROP INDEX `leaves_status_idx`;--> statement-breakpoint

-- 구간: 휴가 조인으로 구간을 모을 때 leave_id로 찾고 start_date로 정렬한다.
DROP INDEX `leave_segments_leave_idx`;--> statement-breakpoint
CREATE INDEX `leave_segments_leave_start_idx` ON `leave_segments` (`leave_id`,`start_date`);--> statement-breakpoint

-- (user_id)는 (user_id, balance_key)의 접두사다. 중복 인덱스.
DROP INDEX `leave_grants_user_idx`;--> statement-breakpoint

-- 부대원 목록이 이름순 정렬을 인덱스로 끝낸다(1.107ms → 0.472ms, -33%).
-- 인원수 세기는 여전히 COVERING INDEX로 처리된다.
DROP INDEX `users_unit_idx`;--> statement-breakpoint
CREATE INDEX `users_unit_name_idx` ON `users` (`unit_id`,`name`);--> statement-breakpoint

-- (user_id)는 유니크 인덱스 (user_id, balance_key)의 접두사다. 중복 인덱스.
DROP INDEX `user_leave_balances_user_idx`;--> statement-breakpoint

-- (user_id)는 기본키 (user_id, blocked_user_id)의 접두사다. 차단 목록 조회는 실제로
-- 기본키 인덱스를 COVERING INDEX로 쓴다 — 이 인덱스는 선택되지 않는다.
DROP INDEX `user_blocks_user_idx`;
