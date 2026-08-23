/**
 * 친구 관계의 상태 기계와 차단 판정 — 친구·사용자 라우트가 함께 쓴다.
 *
 * 사용처: routes/friends.ts, routes/users.ts.
 *
 * 여기 있는 것이 이 기능의 보안 경계다. 화면이 버튼을 감추는 것은 편의일 뿐이고,
 * "이 사람의 일정을 볼 수 있는가"는 매 요청마다 DB의 현재 상태로 다시 판정된다.
 *
 * ## pending → accepted 로 가는 길은 하나뿐이다
 *
 * 예전에는 A→B 요청이 대기 중일 때 B가 A에게 요청을 보내면 서버가 둘을 곧바로
 * 친구로 만들었다. "서로 원했으니 맞다"는 판단이었지만, 그러면 **받는 사람이
 * 수락을 누른 적 없이** 친구가 된다 — B는 A를 검색하다 버튼을 한 번 눌렀을 뿐인데
 * 그 순간 자기 일정이 공개된다. 지금은 반대 방향 요청을 409로 돌려보내고
 * (`incoming_request_exists`), 화면이 수락/거절을 묻는다.
 *
 * 그래서 이 파일에는 상태를 accepted로 바꾸는 함수가 `acceptFriendRequest` 하나뿐이고,
 * 그 함수는 "요청자가 내가 아닌 pending 행"에만 쓴다. 다른 경로는 없다.
 */

import { canonicalFriendPair, type FriendRelationship } from "@leave/shared";
import { and, eq, or } from "drizzle-orm";
import { friendships, userBlocks, type FriendshipRow } from "../db/schema";
import type { Db } from "./db";

/** 정규화된 쌍 한 행을 가리키는 조건. */
export function friendshipPairWhere(first: string, second: string) {
  const [userAId, userBId] = canonicalFriendPair(first, second);
  return and(
    eq(friendships.userAId, userAId),
    eq(friendships.userBId, userBId),
  );
}

export function readFriendship(db: Db, first: string, second: string) {
  return db
    .select()
    .from(friendships)
    .where(friendshipPairWhere(first, second))
    .get();
}

/** 어느 방향으로든 차단이 걸려 있는가. */
export async function areBlocked(
  db: Db,
  first: string,
  second: string,
): Promise<boolean> {
  const row = await db
    .select({ userId: userBlocks.userId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.userId, first), eq(userBlocks.blockedUserId, second)),
        and(eq(userBlocks.userId, second), eq(userBlocks.blockedUserId, first)),
      ),
    )
    .get();
  return Boolean(row);
}

/**
 * 관계 한 행을 조회자 관점의 상태로 바꾼다.
 *
 * 행이 없으면 `none`. pending이면 요청자가 누구냐에 따라 outgoing/incoming이 갈린다.
 * 차단은 여기서 다루지 않는다 — 차단된 상대는 애초에 조회 결과에 들어오지 않는다.
 */
export function relationshipFrom(
  row: Pick<FriendshipRow, "status" | "requestedByUserId"> | null | undefined,
  viewerId: string,
  targetId: string,
): FriendRelationship {
  if (viewerId === targetId) return "self";
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requestedByUserId === viewerId ? "outgoing" : "incoming";
}

/**
 * 친구 요청을 만든다.
 *
 * 반환값이 곧 라우트가 고를 응답이다.
 *  - created   : 새 pending 행이 생겼다
 *  - unchanged : 같은 방향 요청이 이미 있다 (멱등)
 *  - incoming  : 상대가 이미 나에게 요청해 뒀다 → 수락/거절해야 한다
 *  - friends   : 이미 친구다
 *
 * 동시에 서로에게 보낸 두 요청은 유니크한 기본키(정규화된 쌍) 덕분에 한 행만
 * 살아남는다. 진 쪽은 `onConflictDoNothing`으로 조용히 지나간 뒤 아래에서 행을
 * 다시 읽어 `incoming`을 받는다 — 그 사람은 수락 버튼을 보게 되고, 자동으로
 * 친구가 되지는 않는다.
 */
export type FriendRequestOutcome =
  "created" | "unchanged" | "incoming" | "friends";

export async function createFriendRequest(
  db: Db,
  requesterId: string,
  targetId: string,
): Promise<FriendRequestOutcome> {
  const existing = await readFriendship(db, requesterId, targetId);
  const outcome = classify(existing, requesterId);
  if (outcome) return outcome;

  const now = new Date().toISOString();
  const [userAId, userBId] = canonicalFriendPair(requesterId, targetId);
  await db
    .insert(friendships)
    .values({
      userAId,
      userBId,
      requestedByUserId: requesterId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      acceptedAt: null,
    })
    .onConflictDoNothing();

  // 경합에서 졌다면 지금 남아 있는 행은 상대의 요청이다. 다시 읽어 그 상태를
  // 그대로 돌려준다 — 여기서 수락으로 수렴시키면 위 주석의 사고가 되돌아온다.
  const persisted = await readFriendship(db, requesterId, targetId);
  return classify(persisted, requesterId) ?? "created";
}

function classify(
  row: FriendshipRow | undefined,
  requesterId: string,
): FriendRequestOutcome | null {
  if (!row) return null;
  if (row.status === "accepted") return "friends";
  return row.requestedByUserId === requesterId ? "unchanged" : "incoming";
}

/**
 * 받은 요청을 수락한다. pending → accepted 로 가는 **유일한** 경로다.
 *
 * `requested_by_user_id != 수락자` 조건을 WHERE에 담아, 자기가 보낸 요청을
 * 자기가 수락하는 일이 SQL 단계에서 불가능하게 만든다. 취소와 겹쳐 행이 이미
 * 사라졌다면 아무 행도 바뀌지 않고 false가 돌아간다 — 그때 "친구가 됐다"고
 * 답하면 화면과 DB가 갈라진다.
 */
export async function acceptFriendRequest(
  db: Db,
  accepterId: string,
  requesterId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(friendships)
    .set({ status: "accepted", acceptedAt: now, updatedAt: now })
    .where(
      and(
        friendshipPairWhere(accepterId, requesterId),
        eq(friendships.status, "pending"),
        eq(friendships.requestedByUserId, requesterId),
      ),
    );
  return changedRows(result) > 0;
}

/**
 * D1의 실행 결과에서 바뀐 행 수를 꺼낸다.
 *
 * drizzle의 `update`/`delete` 반환 타입은 드라이버마다 달라 구조를 좁혀 읽는다.
 * 수락·거절·취소·삭제가 "정말 바뀌었는가"를 응답 코드로 옮겨야 하는데,
 * 값을 못 읽으면 조용히 성공으로 답하게 되므로 모르는 모양은 0으로 본다.
 */
function changedRows(result: unknown): number {
  if (result && typeof result === "object") {
    const meta = (result as { meta?: { changes?: unknown } }).meta;
    if (meta && typeof meta.changes === "number") return meta.changes;
    const changes = (result as { changes?: unknown }).changes;
    if (typeof changes === "number") return changes;
    const rowsAffected = (result as { rowsAffected?: unknown }).rowsAffected;
    if (typeof rowsAffected === "number") return rowsAffected;
  }
  return 0;
}

/** 받은 요청을 거절한다. 행을 지워 관계를 `none`으로 되돌린다. */
export async function declineFriendRequest(
  db: Db,
  declinerId: string,
  requesterId: string,
): Promise<boolean> {
  const result = await db
    .delete(friendships)
    .where(
      and(
        friendshipPairWhere(declinerId, requesterId),
        eq(friendships.status, "pending"),
        eq(friendships.requestedByUserId, requesterId),
      ),
    );
  return changedRows(result) > 0;
}

/** 보낸 요청을 취소한다. */
export async function cancelFriendRequest(
  db: Db,
  requesterId: string,
  targetId: string,
): Promise<boolean> {
  const result = await db
    .delete(friendships)
    .where(
      and(
        friendshipPairWhere(requesterId, targetId),
        eq(friendships.status, "pending"),
        eq(friendships.requestedByUserId, requesterId),
      ),
    );
  return changedRows(result) > 0;
}

/**
 * 친구를 삭제한다. 한 행뿐이라 한쪽이 지우면 양쪽 모두에게서 사라진다 —
 * 단방향 팔로우 같은 중간 상태가 이 모델에는 없다.
 */
export async function removeFriendship(
  db: Db,
  userId: string,
  otherId: string,
): Promise<boolean> {
  const result = await db
    .delete(friendships)
    .where(
      and(
        friendshipPairWhere(userId, otherId),
        eq(friendships.status, "accepted"),
      ),
    );
  return changedRows(result) > 0;
}
