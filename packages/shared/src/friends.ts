/** 친구 관계와 여러 명 달력 선택에 쓰는 플랫폼 독립 규칙. */

export const MAX_FRIEND_CALENDAR_SELECTION = 10;

/** 계정과 친구 찾기가 반드시 같은 정확 일치 키를 쓰도록 한다. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 선택 순서와 중복에 무관한 API 입력·React Query 키를 만든다. */
export function normalizeFriendIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

/** DB에서 관계 한 건만 갖도록 두 사용자를 사전순으로 정규화한다. */
export function canonicalFriendPair(
  firstUserId: string,
  secondUserId: string,
): readonly [string, string] {
  return firstUserId < secondUserId
    ? [firstUserId, secondUserId]
    : [secondUserId, firstUserId];
}
