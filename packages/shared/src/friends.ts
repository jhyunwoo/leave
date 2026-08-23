/** 친구 관계와 여러 명 달력 선택에 쓰는 플랫폼 독립 규칙. */

export const MAX_FRIEND_CALENDAR_SELECTION = 10;

/** 검색·프로필이 한 번에 최대로 돌려주는 사용자 수. */
export const USER_SEARCH_LIMIT = 20;

/** 계정과 로그인이 반드시 같은 정확 일치 키를 쓰도록 한다. */
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

/**
 * 조회자와 상대 사이의 관계. 검색 결과·프로필이 이 값 하나로 버튼을 고른다.
 *
 *  - self     : 나 자신
 *  - none     : 아무 관계 없음 → "친구 추가"
 *  - outgoing : 내가 보낸 요청이 대기 중 → "요청됨 / 취소"
 *  - incoming : 상대가 보낸 요청이 대기 중 → "수락 / 거절"
 *  - friends  : 서로 수락 → 일정 열람 가능
 *
 * `outgoing`이 `friends`로 넘어가는 길은 **받는 사람의 명시적 수락 하나뿐**이다.
 * 반대 방향 요청이 겹쳐도 자동으로 친구가 되지 않는다(0023에서 고친 동작).
 */
export const FRIEND_RELATIONSHIPS = [
  "self",
  "none",
  "outgoing",
  "incoming",
  "friends",
] as const;

export type FriendRelationship = (typeof FRIEND_RELATIONSHIPS)[number];

/**
 * 클라이언트가 문구 대신 분기할 수 있는 안정적인 오류 코드.
 *
 * 한국어 메시지는 언제든 다듬을 수 있어야 하는데, 화면이 메시지 문자열을 비교하면
 * 문구를 고치는 순간 조용히 분기가 끊긴다. 서버는 `{ error, code }`로 함께 보낸다.
 */
export const SOCIAL_ERROR_CODES = {
  /** 이미 다른 사람이 가진 사용자 이름 (409). */
  usernameTaken: "username_taken",
  /** 규칙에 맞지 않는 사용자 이름 (400). */
  usernameInvalid: "username_invalid",
  /** 대상 없음 — 차단·탈퇴·오타를 구분하지 않는다 (404). */
  userUnavailable: "user_unavailable",
  /** 자기 자신에게 보낸 요청 (400). */
  selfRequest: "self_request",
  /** 이미 친구 (409). */
  alreadyFriends: "already_friends",
  /** 상대가 이미 나에게 요청을 보내 둔 상태 — 수락/거절해야 한다 (409). */
  incomingRequestExists: "incoming_request_exists",
  /** 수락·거절·취소할 요청이 없음 (404). */
  requestNotFound: "request_not_found",
  /** 친구가 아니라 일정을 볼 수 없음 (403). */
  notFriends: "not_friends",
  /** 아직 사용자 이름을 정하지 않음 (409). */
  usernameRequired: "username_required",
} as const;

export type SocialErrorCode =
  (typeof SOCIAL_ERROR_CODES)[keyof typeof SOCIAL_ERROR_CODES];
