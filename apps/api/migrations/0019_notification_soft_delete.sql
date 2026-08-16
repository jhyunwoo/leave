-- 사용자가 알림함에서 지운 알림을 표시한다.
-- 물리 삭제하지 않는 이유: 관리자 화면(admin)에 남는 발송 이력과 감사 로그가
-- 사용자 조작으로 사라지면 안 되고, 오삭제 복구 여지를 남기기 위해서다.
-- 사용자 API(GET /notifications, POST /notifications/read)는 이 값이 비어 있는
-- 행만 다룬다.
ALTER TABLE `notifications` ADD `deleted_at` text;
