import {
  effectiveMemberCount,
  findExceededDates,
  usersOnLeaveDuring,
  type ISODate,
} from "@leave/shared";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
  leaves,
  notifications,
  pushLogs,
  units,
  users,
  type LeaveRow,
} from "../db/schema";
import { sendExpoPush } from "./push";

function formatDateList(dates: ISODate[]): string {
  const first = dates[0];
  if (!first) return "";
  const [, m, d] = first.split("-");
  const label = `${Number(m)}월 ${Number(d)}일`;
  return dates.length > 1 ? `${label} 외 ${dates.length - 1}일` : label;
}

/**
 * 휴가 등록/수정 후 해당 기간의 출타율 초과일을 계산하고,
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

  const unit = await db.select().from(units).where(eq(units.id, unitId)).get();
  if (!unit) return [];

  const members = await db
    .select()
    .from(users)
    .where(eq(users.unitId, unitId))
    .all();
  const memberIds = members.map((m) => m.id);
  if (memberIds.length === 0) return [];

  const unitLeaves = await db
    .select()
    .from(leaves)
    .where(
      and(
        inArray(leaves.userId, memberIds),
        lte(leaves.startDate, changedLeave.endDate),
        gte(leaves.endDate, changedLeave.startDate),
      ),
    )
    .all();

  const spans = unitLeaves.map((l) => ({
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
    memberCount: effectiveMemberCount(unit.headcount, members.length),
    ratio: {
      numerator: unit.maxLeaveNumerator,
      denominator: unit.maxLeaveDenominator,
    },
  });
  if (exceededDates.length === 0) return [];

  const affectedIds = usersOnLeaveDuring(spans, exceededDates);
  if (affectedIds.length > 0) {
    const now = new Date().toISOString();
    const title = "출타율 초과 알림";
    const body = `${unit.name}에서 ${formatDateList(exceededDates)}에 최대 출타 인원을 초과했습니다. 휴가 일정을 확인해주세요.`;

    // 사용자별 인앱 알림 id를 미리 만들어 두면 푸시 발송 로그와 연결할 수 있다.
    const notificationIdByUser = new Map(
      affectedIds.map((userId) => [userId, crypto.randomUUID()]),
    );
    await db.insert(notifications).values(
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
    );

    const affectedMembers = members.filter((m) => affectedIds.includes(m.id));
    const data = { type: "overage", unitId, dates: exceededDates };

    // 푸시 발송과 발송 로그 저장을 하나의 백그라운드 작업으로 처리해 응답을 막지 않는다.
    waitUntil(
      (async () => {
        const results = await sendExpoPush(
          affectedMembers.map((m) => m.expoPushToken),
          { title, body, data },
        );
        const resultByToken = new Map(results.map((r) => [r.token, r]));
        const dataJson = JSON.stringify(data);

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
            title,
            body,
            dataJson,
            // 유효 토큰이 없으면 skipped, 있으면 발송 결과(ok/error)
            status: result ? result.status : "skipped",
            detail: result?.detail ?? (token ? null : "토큰 없음"),
            createdAt: new Date().toISOString(),
          };
        });
        if (logRows.length > 0) {
          await db.insert(pushLogs).values(logRows);
        }
      })(),
    );
  }
  return exceededDates;
}
