/**
 * 회원 탈퇴 — 한 사용자와 그에 딸린 데이터를 모두 지우는 작업.
 *
 * 사용처: `DELETE /auth/account` (routes/auth.ts).
 *
 * 라우트에서 떼어 둔 이유는 길이가 아니라 성격이다. 이건 되돌릴 수 없는 데이터
 * 삭제이고, "무엇이 지워지고 무엇이 남는가"가 곧 개인정보 처리방침의 약속이다.
 * 그 약속을 한 파일에서 위에서 아래로 읽을 수 있어야 한다.
 *
 * 순서에 의미가 있다.
 *  1) 그룹 정리를 **먼저** 한다. 사용자 행이 사라진 뒤에는 "이 사람이 관리자였는지"를
 *     알 수 없어 그룹이 관리자 없이 남는다.
 *  2) 외래키가 없는 표를 직접 지운다(아래 참고).
 *  3) 마지막에 사용자 행을 지운다.
 *
 * D1은 ON DELETE CASCADE를 실제로 적용하므로, users를 참조하는 표
 * (leaves→leave_segments, leave_grants, regular_overnight_configs,
 *  sessions, notifications, user_notification_prefs)는
 * 마지막 한 줄로 함께 사라진다. 그래도 명시적으로 지우는 것들이 있는데,
 * 이유가 둘로 갈린다.
 *  - 외래키가 **없어서** 반드시 직접 지워야 하는 것: access_logs, push_logs,
 *    user_blocks, content_reports. 빠뜨리면 탈퇴 후에도 데이터가 남는다.
 *  - 외래키가 있지만 그래도 적어 두는 것: 지워지는 목록을 이 함수만 읽어도 알 수
 *    있게 하려는 것이다. 중복 삭제라 부작용은 없다.
 */

import { and, asc, eq, ne } from "drizzle-orm";
import {
  accessLogs,
  contentReports,
  leaves,
  notifications,
  pushLogs,
  sessions,
  unitInvites,
  units,
  userBlocks,
  userNotificationPrefs,
  users,
} from "../db/schema";
import { runBatch, type BatchItem } from "./d1";
import type { Db } from "./db";

type DeletableUser = { id: string; unitId: string | null };

/**
 * 탈퇴자가 그룹 관리자라면 그룹이 관리자 없이 남지 않게 정리한다.
 * 남은 부대원이 있으면 가장 먼저 들어온 사람에게 넘기고, 혼자였다면
 * 빈 그룹과 그 초대코드를 함께 없앤다(살아 있는 코드로 빈 그룹에 들어오지 못하게).
 */
async function handOverOrCloseUnit(db: Db, user: DeletableUser): Promise<void> {
  if (!user.unitId) return;

  const unit = await db
    .select()
    .from(units)
    .where(eq(units.id, user.unitId))
    .get();
  if (!unit || unit.adminId !== user.id) return;

  const heir = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.unitId, user.unitId), ne(users.id, user.id)))
    .orderBy(asc(users.createdAt))
    .get();

  if (heir) {
    await db
      .update(units)
      .set({ adminId: heir.id })
      .where(eq(units.id, user.unitId));
    return;
  }

  await db.delete(unitInvites).where(eq(unitInvites.unitId, user.unitId));
  await db.delete(units).where(eq(units.id, user.unitId));
}

/**
 * 사용자를 가리키는 흔적을 모두 지운다. 마지막이 사용자 행이다.
 *
 * 한 문장씩 await 하면 중간에 실패했을 때 "휴가는 지워졌는데 계정은 살아 있는" 상태가
 * 남는다. 되돌릴 수 없는 삭제에서 그런 중간 상태는 개인정보 약속을 깨뜨린다 —
 * batch는 한 트랜잭션이라 전부 지워지거나 아무것도 안 지워지거나 둘 중 하나다.
 */
async function purgeUserData(db: Db, userId: string): Promise<void> {
  const statements: BatchItem[] = [
    db.delete(leaves).where(eq(leaves.userId, userId)),
    db.delete(notifications).where(eq(notifications.userId, userId)),
    db.delete(sessions).where(eq(sessions.userId, userId)),
    db.delete(accessLogs).where(eq(accessLogs.userId, userId)),
    db.delete(pushLogs).where(eq(pushLogs.userId, userId)),
    db
      .delete(userNotificationPrefs)
      .where(eq(userNotificationPrefs.userId, userId)),

    // 내가 건 차단과 남이 나를 건 차단 모두 지운다. 남으면 없는 id를 계속 숨긴다.
    db.delete(userBlocks).where(eq(userBlocks.userId, userId)),
    db.delete(userBlocks).where(eq(userBlocks.blockedUserId, userId)),

    // 접수된 신고 자체는 운영 증적으로 남기되 신고자 식별자는 끊는다.
    db
      .update(contentReports)
      .set({ reporterId: null })
      .where(eq(contentReports.reporterId, userId)),

    db.delete(users).where(eq(users.id, userId)),
  ];
  await runBatch(db, statements);
}

/** 계정과 관련 데이터를 모두 삭제한다. 되돌릴 수 없다. */
export async function deleteAccount(
  db: Db,
  user: DeletableUser,
): Promise<void> {
  await handOverOrCloseUnit(db, user);
  await purgeUserData(db, user.id);
}
