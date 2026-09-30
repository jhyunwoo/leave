-- 친구 요청 알림에 보낸 사람을 남긴다.
--
-- 알림함의 "자세히"가 친구 탭의 그 사람 요청으로 곧장 이어지려면 누가 보낸
-- 요청인지 알아야 한다. 이 열이 생기기 전의 알림은 비어 있다 — 그때는 친구 탭으로만
-- 보내고 특정 요청을 짚지 않는다(routes/notifications.ts의 parseFriendRequest).
ALTER TABLE notifications ADD COLUMN friend_request_user_id TEXT;
