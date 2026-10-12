/**
 * 사용자 한 명의 외부 캘린더 피드 항목 조회.
 *
 * 사용처: `GET /calendar/:token.ics`(routes/calendar-public.ts),
 * `GET /calendar-feed/items`(routes/calendar-feed.ts).
 *
 * 조립 규칙은 @leave/shared의 `buildFeedItems`에 있다. 여기는 "무엇을 읽는가"만 맡는다.
 * ⚠ 응답이 사용자마다 다르다. 캐싱한다면 키에 사용자 id가 반드시 들어가야 한다.
 */
import {
  buildFeedItems,
  FEED_EXCLUDED_LEAVE_STATUSES,
  feedRangeStart,
  type FeedItem,
  type ISODate,
} from "@leave/shared";
import { and, asc, eq, gte, notInArray } from "drizzle-orm";
import {
  leaveSegments,
  leaves,
  personalEvents,
  unitEvents,
  units,
  users,
} from "../db/schema";
import type { Db } from "./db";

export function feedUrlFor(origin: string, token: string): string {
  return `${origin}/calendar/${token}.ics`;
}

export async function loadFeedItems(
  db: Db,
  userId: string,
  today: ISODate,
): Promise<FeedItem[]> {
  const rangeStart = feedRangeStart(today);
  const visibleLeave = and(
    eq(leaves.userId, userId),
    gte(leaves.endDate, rangeStart),
    notInArray(leaves.status, [...FEED_EXCLUDED_LEAVE_STATUSES]),
  );

  // 네 조회는 서로를 기다리지 않는다. 부대 일정은 사용자 행을 거쳐 "지금 소속 그룹"으로
  // 좁힌다 — 그룹이 없으면 조인이 비어 따로 분기할 필요가 없다.
  const [leaveRows, segmentRows, personalRows, unitRows] = await db.batch([
    db
      .select({
        id: leaves.id,
        title: leaves.title,
        startDate: leaves.startDate,
        endDate: leaves.endDate,
        returnTime: leaves.returnTime,
        reason: leaves.reason,
        status: leaves.status,
      })
      .from(leaves)
      .where(visibleLeave)
      .orderBy(asc(leaves.startDate)),
    db
      .select({
        leaveId: leaveSegments.leaveId,
        category: leaveSegments.category,
        overnightKind: leaveSegments.overnightKind,
        outingKind: leaveSegments.outingKind,
        startDate: leaveSegments.startDate,
        endDate: leaveSegments.endDate,
      })
      .from(leaveSegments)
      .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
      .where(visibleLeave)
      .orderBy(asc(leaveSegments.startDate)),
    db
      .select({
        id: personalEvents.id,
        title: personalEvents.title,
        startDate: personalEvents.startDate,
        endDate: personalEvents.endDate,
        startTime: personalEvents.startTime,
        endTime: personalEvents.endTime,
        note: personalEvents.note,
      })
      .from(personalEvents)
      .where(
        and(
          eq(personalEvents.ownerUserId, userId),
          gte(personalEvents.endDate, rangeStart),
        ),
      ),
    db
      .select({
        id: unitEvents.id,
        title: unitEvents.title,
        startDate: unitEvents.startDate,
        endDate: unitEvents.endDate,
        startTime: unitEvents.startTime,
        endTime: unitEvents.endTime,
        details: unitEvents.details,
        unitName: units.name,
      })
      .from(unitEvents)
      .innerJoin(users, eq(users.unitId, unitEvents.unitId))
      .innerJoin(units, eq(units.id, unitEvents.unitId))
      .where(and(eq(users.id, userId), gte(unitEvents.endDate, rangeStart))),
  ]);

  const segmentsByLeave = new Map<string, typeof segmentRows>();
  for (const segment of segmentRows) {
    const list = segmentsByLeave.get(segment.leaveId) ?? [];
    list.push(segment);
    segmentsByLeave.set(segment.leaveId, list);
  }

  return buildFeedItems({
    leaves: leaveRows.map((leave) => ({
      ...leave,
      segments: segmentsByLeave.get(leave.id) ?? [],
    })),
    personalEvents: personalRows,
    unitEvents: unitRows,
    unitName: unitRows[0]?.unitName ?? null,
  });
}
