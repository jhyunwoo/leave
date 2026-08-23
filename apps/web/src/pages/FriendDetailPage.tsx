/**
 * 옛 친구 상세 주소(`/friends/:userId`)를 정본 프로필로 넘긴다.
 *
 * 공유된 링크와 북마크가 깨지지 않도록 남겨 둔 호환 경로다. 새 링크는 어디서도
 * 이 주소를 만들지 않는다 — 공유 주소에 내부 사용자 id가 들어가면 이름을 바꿔도
 * 링크가 살아 있는 대신, 공개 링크가 DB 식별자를 그대로 노출하게 된다.
 *
 * 친구 목록에 없는 id면 되돌릴 이름을 알 수 없다. 그때는 친구 화면으로 보낸다 —
 * 임의의 id로 남의 이름을 되짚는 경로를 열어 줄 이유가 없다.
 */

import { useFriends } from "@leave/client";
import { Navigate, useParams } from "react-router";

export function FriendDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const friends = useFriends();

  if (friends.isPending) {
    return (
      <div style={{ padding: "var(--sp-3xl) 0", textAlign: "center" }}>
        <div className="spinner" aria-label="불러오는 중" />
      </div>
    );
  }

  const friend = friends.data?.friends.find((row) => row.userId === userId);
  return friend?.username ? (
    <Navigate to={`/u/${friend.username}`} replace />
  ) : (
    <Navigate to="/friends" replace />
  );
}
