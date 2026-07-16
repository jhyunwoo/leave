import {
  findExceededDates,
  usersOnLeaveDuring,
  type ISODate,
} from "@leave/shared";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { leaves, notifications, units, users, type LeaveRow } from "../db/schema";
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
    memberCount: members.length,
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

    await db.insert(notifications).values(
      affectedIds.map((userId) => ({
        id: crypto.randomUUID(),
        userId,
        title,
        body,
        leaveId: changedLeave.id,
        datesJson: JSON.stringify(exceededDates),
        read: false,
        createdAt: now,
      })),
    );

    const tokens = members
      .filter((m) => affectedIds.includes(m.id))
      .map((m) => m.expoPushToken);
    waitUntil(
      sendExpoPush(tokens, {
        title,
        body,
        data: { type: "overage", unitId, dates: exceededDates },
      }),
    );
  }
  return exceededDates;
}
