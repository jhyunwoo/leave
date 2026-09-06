/**
 * 출타 초과 감지와 알림 발송.
 *
 * 사용처: 휴가 등록·수정 라우트(apps/api/src/routes/leaves.ts)와 관리자 워커.
 *
 * 이 서비스의 핵심 약속 — "내 계획 때문에 그날이 초과되면, 그날 나가려던 사람들이
 * 바로 안다" — 을 실행하는 곳이다. 인앱 알림과 Expo 푸시를 함께 만들되,
 * 초과 알림을 끈 사용자는 양쪽 모두에서 제외한다.
 */

import {
  findExceededDates,
  isCountedLeaveStatus,
  usersOnLeaveDuring,
  type ISODate,
} from "@leave/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
  leaves,
  notifications,
  pushLogs,
  units,
  userNotificationPrefs,
  users,
  type LeaveRow,
} from "../db/schema";
import { insertStatements, runBatch } from "./d1";
import { buildNotificationPushMessage, sendExpoPushMessages } from "./push";

function formatDateList(dates: ISODate[]): string {
  const first = dates[0];
  if (!first) return "";
  const [, m, d] = first.split("-");
  const label = `${Number(m)}월 ${Number(d)}일`;
  return dates.length > 1 ? `${label} 외 ${dates.length - 1}일` : label;
}

/**
 * 휴가 등록/수정 후 해당 기간의 최대 출타 인원 초과일을 계산하고,
 * 초과일에 휴가가 걸린 모든 부대원에게 알림(인앱 + 푸시)을 보낸다.
 * @returns 초과된 날짜 목록 (없으면 빈 배열)
 */
export async function checkOverageAndNotify(params: {
  db: DrizzleD1Database;
  unitId: string;
  changedLeave: LeaveRow;
  waitUntil: (promise: Promise<unknown>) => void;
}): Promise<ISODate[]> {
  const { db, unitId, changedLeave, waitUntil } = params;

  // 초안은 나만 보는 시뮬레이션이라 남에게 알림을 보내지 않는다.
  // 아무것도 읽기 전에 끊는다 — 예전에는 부대·부대원·휴가를 다 읽은 뒤에야 여기서 나갔다.
  if (!isCountedLeaveStatus(changedLeave.status)) return [];

  /*
   * 부대 행과 겹치는 휴가를 한 번의 왕복으로 읽는다.
   *
   * 예전에는 (1) 부대, (2) 부대원 전체를 `select *`로, (3) 그 id들을 IN(...)에 넣어
   * 휴가 — 세 번을 순서대로 돌았다. 부대원 목록은 겹치는 휴가를 찾는 데에만 쓰였는데
   * 부대 조인이면 필요 없고, 무엇보다 부대원이 99명을 넘으면 D1 바인드 파라미터
   * 상한(100)에 걸려 **휴가 등록 자체가 500**이 됐다.
   * 부대원 행은 초과가 실제로 발생했을 때만, 그것도 알림 대상만 읽는다.
   */
  const [unitRows, unitLeaves] = await db.batch([
    db.select().from(units).where(eq(units.id, unitId)),
    db
      .select({
        userId: leaves.userId,
        startDate: leaves.startDate,
        endDate: leaves.endDate,
        status: leaves.status,
      })
      .from(leaves)
      .innerJoin(users, eq(leaves.userId, users.id))
      .where(
        and(
          eq(users.unitId, unitId),
          lte(leaves.startDate, changedLeave.endDate),
          gte(leaves.endDate, changedLeave.startDate),
        ),
      ),
  ]);
  const unit = unitRows[0];
  if (!unit) return [];

  // 초안·반려·취소된 계획은 실제로 나가지 않으므로 집계에서 뺀다.
  const spans = unitLeaves
    .filter((l) => isCountedLeaveStatus(l.status))
    .map((l) => ({
      userId: l.userId,
      startDate: l.startDate,
      endDate: l.endDate,
    }));

  const exceededDates = findExceededDates({
    leaves: spans,
    newLeave: {
      startDate: changedLeave.startDate,
      endDate: changedLeave.endDate,
    },
    maxCount: unit.maxLeaveCount,
    returnDayCounts: unit.returnDayCounts,
  });
  if (exceededDates.length === 0) return [];

  const allAffectedIds = usersOnLeaveDuring(spans, exceededDates);
  if (allAffectedIds.length === 0) return exceededDates;

  /*
   * 초과 알림을 끈 사용자와, 푸시를 보낼 토큰을 한 번의 왕복으로 읽는다.
   * 대상 id를 IN(...)에 넣지 않고 부대로 좁힌다 — 대상이 100명을 넘어도 죽지 않고,
   * 부대 규모는 어차피 이 조회의 상한이다.
   */
  const [optedOutRows, memberRows] = await db.batch([
    db
      .select({ userId: userNotificationPrefs.userId })
      .from(userNotificationPrefs)
      .innerJoin(users, eq(userNotificationPrefs.userId, users.id))
      .where(
        and(eq(users.unitId, unitId), eq(userNotificationPrefs.overage, false)),
      ),
    db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.unitId, unitId)),
  ]);
  const optedOut = new Set(optedOutRows.map((pref) => pref.userId));
  const affectedIds = allAffectedIds.filter((id) => !optedOut.has(id));

  if (affectedIds.length > 0) {
    const now = new Date().toISOString();
    const title = "최대 출타 인원 초과 알림";
    const body = `${unit.name}에서 ${formatDateList(exceededDates)}에 최대 출타 인원을 초과했습니다. 휴가 일정을 확인해주세요.`;

    // 사용자별 인앱 알림 id를 미리 만들어 두면 푸시 발송 로그와 연결할 수 있다.
    const notificationIdByUser = new Map(
      affectedIds.map((userId) => [userId, crypto.randomUUID()]),
    );
    // 대상이 12명을 넘으면 한 INSERT 문이 D1 바인드 파라미터 상한을 넘겨 휴가 등록
    // 자체가 500이 됐다(알림 행은 컬럼이 9개다). 나눠 담되 한 batch로 묶어
    // "일부에게만 알림이 간" 상태가 남지 않게 한다.
    await runBatch(
      db,
      insertStatements(
        db,
        notifications,
        affectedIds.map((userId) => ({
          id: notificationIdByUser.get(userId)!,
          userId,
          title,
          body,
          leaveId: changedLeave.id,
          datesJson: JSON.stringify(exceededDates),
          read: false,
          createdAt: now,
        })),
      ),
    );

    const affectedSet = new Set(affectedIds);
    const affectedMembers = memberRows.filter((m) => affectedSet.has(m.id));

    // 푸시 발송과 발송 로그 저장을 하나의 백그라운드 작업으로 처리해 응답을 막지 않는다.
    waitUntil(
      (async () => {
        const results = await sendExpoPushMessages(
          affectedMembers.map((member) => ({
            token: member.expoPushToken,
            message: buildNotificationPushMessage({
              id: notificationIdByUser.get(member.id)!,
              title,
              body,
            }),
          })),
        );
        const resultByToken = new Map(results.map((r) => [r.token, r]));

        // 부대원별로 발송 결과를 push_logs(direction: send)에 남긴다.
        const logRows = affectedMembers.map((m) => {
          const token = m.expoPushToken;
          const result =
            token && token.startsWith("ExponentPushToken")
              ? resultByToken.get(token)
              : undefined;
          return {
            id: crypto.randomUUID(),
            userId: m.id,
            notificationId: notificationIdByUser.get(m.id) ?? null,
            direction: "send" as const,
            // 유효 토큰이 없으면 skipped, 있으면 발송 결과(ok/error)
            status: result ? result.status : "skipped",
            createdAt: new Date().toISOString(),
          };
        });
        // 발송 대상이 16명을 넘으면 한 문장이 상한을 넘는다 — 여기도 나눠 담는다.
        // 이 실패는 waitUntil 안이라 사용자에게 보이지 않고 로그만 조용히 비었다.
        await runBatch(db, insertStatements(db, pushLogs, logRows));
      })(),
    );
  }
  return exceededDates;
}
