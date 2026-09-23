/**
 * 친구에게 보여줄 항목 — 설정을 읽고 바꾸고, 행이 없을 때의 값을 정한다.
 *
 * 사용처: routes/friends.ts(설정·친구 목록·달력·일정), lib/social-notify.ts(새 휴가 알림).
 *
 * 여기서 정하는 것은 "무엇을 보여주는가"뿐이다. "이 사람이 볼 수 있는 사이인가"(수락·차단)는
 * 라우트가 매 요청마다 먼저 판정한다 — 공유를 켜 둔 것은 친구에게 보여주겠다는 뜻이지
 * 아무에게나 열겠다는 뜻이 아니다.
 *
 * 끈 항목은 응답에서 **빼야** 한다. 화면이 감추는 것은 편의일 뿐이고, 받아 간 본문은
 * 누구든 열어 볼 수 있다.
 */

import type { FriendSharingInput } from "@leave/shared";
import { eq } from "drizzle-orm";
import { userFriendSharing } from "../db/schema";
import type { Db } from "./db";

export type FriendSharing = Required<FriendSharingInput>;

/** 행이 없으면 전부 공유한다 — 이 설정이 생기기 전의 동작 그대로다. */
export const DEFAULT_FRIEND_SHARING: FriendSharing = {
  serviceProgress: true,
  dutyDays: true,
  leaveSchedule: true,
};

/** select에 그대로 펼쳐 쓰는 컬럼 묶음. leftJoin으로 읽으면 행이 없을 때 셋 다 null이다. */
export const friendSharingColumns = {
  serviceProgress: userFriendSharing.serviceProgress,
  dutyDays: userFriendSharing.dutyDays,
  leaveSchedule: userFriendSharing.leaveSchedule,
};

type StoredSharing = {
  [Key in keyof FriendSharing]: FriendSharing[Key] | null;
};

/**
 * 읽은 값을 확정값으로 바꾼다. null(행 없음)을 기본값으로 채우는 일은 이 함수만 한다 —
 * 읽는 자리마다 따로 채우면 한 곳만 기본값을 반대로 적어도 조용히 새거나 막힌다.
 */
export function resolveFriendSharing(
  stored: StoredSharing | null | undefined,
): FriendSharing {
  return {
    serviceProgress:
      stored?.serviceProgress ?? DEFAULT_FRIEND_SHARING.serviceProgress,
    dutyDays: stored?.dutyDays ?? DEFAULT_FRIEND_SHARING.dutyDays,
    leaveSchedule:
      stored?.leaveSchedule ?? DEFAULT_FRIEND_SHARING.leaveSchedule,
  };
}

/** 한 사람의 설정 조회. `db.batch`에 넣을 수 있게 실행하지 않은 채로 돌려준다. */
export function friendSharingQuery(db: Db, userId: string) {
  return db
    .select(friendSharingColumns)
    .from(userFriendSharing)
    .where(eq(userFriendSharing.userId, userId))
    .limit(1);
}

export async function readFriendSharing(
  db: Db,
  userId: string,
): Promise<FriendSharing> {
  const [row] = await friendSharingQuery(db, userId);
  return resolveFriendSharing(row);
}

/**
 * 보낸 항목만 바꾼다.
 *
 * 읽고 고쳐 쓰지 않고 한 문장으로 넣는다. 서로 다른 항목을 바꾸는 요청 두 건이 겹치면
 * "읽은 뒤 전체를 쓰는" 방식은 먼저 끝난 쪽의 변경을 되돌려 놓는다 — 끈 항목이
 * 사용자 모르게 다시 켜지는 것은 이 설정에서 가장 나쁜 실패다.
 */
export async function updateFriendSharing(
  db: Db,
  userId: string,
  changes: FriendSharingInput,
): Promise<FriendSharing> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(userFriendSharing)
    .values({ userId, ...DEFAULT_FRIEND_SHARING, ...changes, updatedAt: now })
    .onConflictDoUpdate({
      target: userFriendSharing.userId,
      set: { ...changes, updatedAt: now },
    })
    .returning(friendSharingColumns);
  return resolveFriendSharing(row);
}
