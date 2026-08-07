/**
 * 그룹 월별 달력 응답 조립.
 *
 * 사용처: GET /units/{id}/calendar (apps/api/src/routes/units.ts).
 *
 * 이 응답은 이 서비스의 핵심이자 가장 복잡한 읽기다. 한 달치를 만들려면
 * 구성원·휴가·구간·제한기간·차단 목록을 모두 합쳐야 하므로, 라우트 안에 두면
 * 권한 검사와 계산이 뒤섞인다. 조립 규칙만 여기로 분리한다.
 *
 * ⚠ 이 응답은 "누가 보느냐"에 따라 달라진다.
 *   - 내 일정만 제목·사유·초안까지 담긴다.
 *   - 출타 명단에서 조회자가 차단한 사람이 빠진다.
 *   따라서 부대 단위로만 캐싱하면 남의 일정이 새어 나간다(lib/cache.ts 주석 참고).
 */
import {
  computeDayStats,
  isCountedLeaveStatus,
  monthBounds,
} from "@leave/shared";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  leaves,
  unitBlackouts,
  userBlocks,
  users,
  type UnitRow,
} from "../db/schema";
import type { Db } from "./db";
import { segmentsForLeaves } from "./leave-balances";
import { serializeMember, serializeUnit } from "./serialize";

/** 조회자가 차단한 사용자 id 집합. */
async function blockedUserIds(db: Db, viewerId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: userBlocks.blockedUserId })
    .from(userBlocks)
    .where(eq(userBlocks.userId, viewerId))
    .all();
  return new Set(rows.map((row) => row.id));
}

export async function buildCalendarPayload(input: {
  db: Db;
  unit: UnitRow;
  /** 이 응답을 받아 볼 사람. 내 일정 노출과 차단 반영의 기준이 된다. */
  viewerId: string;
  /** YYYY-MM */
  month: string;
}) {
  const { db, unit, viewerId, month } = input;
  const { start, end } = monthBounds(month);

  const members = await db
    .select()
    .from(users)
    .where(eq(users.unitId, unit.id))
    .all();
  const memberIds = members.map((m) => m.id);

  // 이 달에 하루라도 걸치는 휴가만 가져온다(시작<=말일 && 종료>=1일).
  const rows =
    memberIds.length > 0
      ? await db
          .select()
          .from(leaves)
          .where(
            and(
              inArray(leaves.userId, memberIds),
              lte(leaves.startDate, end),
              gte(leaves.endDate, start),
            ),
          )
          .orderBy(asc(leaves.startDate))
          .all()
      : [];

  const blackouts = await db
    .select()
    .from(unitBlackouts)
    .where(
      and(
        eq(unitBlackouts.unitId, unit.id),
        lte(unitBlackouts.startDate, end),
        gte(unitBlackouts.endDate, start),
      ),
    )
    .orderBy(asc(unitBlackouts.startDate))
    .all();
  const isBlocked = (date: string) =>
    blackouts.some((b) => b.startDate <= date && date <= b.endDate);

  const days = computeDayStats({
    // 초안(draft)과 반려·취소된 계획은 실제로 나가지 않으므로 집계에서 뺀다.
    leaves: rows
      .filter((l) => isCountedLeaveStatus(l.status))
      .map((l) => ({
        userId: l.userId,
        startDate: l.startDate,
        endDate: l.endDate,
      })),
    maxCount: unit.maxLeaveCount,
    rangeStart: start,
    rangeEnd: end,
    returnDayCounts: unit.returnDayCounts,
  }).map((day) => ({
    date: day.date,
    count: day.count,
    allowed: day.allowed,
    exceeded: day.exceeded,
    blocked: isBlocked(day.date),
  }));

  // 집계에 들어가는 상태만 이름과 함께 공개한다. 초안은 본인 것이라도 명단에 넣지 않는다.
  const sharedRows = rows.filter((row) => isCountedLeaveStatus(row.status));
  const ownRows = rows.filter((row) => row.userId === viewerId);
  const segmentMap = await segmentsForLeaves(db, [
    ...new Set([...sharedRows, ...ownRows].map((row) => row.id)),
  ]);

  // 내 일정만 제목·사유·초안까지 담아 돌려준다.
  const calendarLeaves = ownRows.map((l) => ({
    id: l.id,
    title: l.title,
    startDate: l.startDate,
    endDate: l.endDate,
    reason: l.reason,
    status: l.status,
    segments: segmentMap.get(l.id) ?? [],
  }));

  // 차단은 이 명단에서만 숨긴다. days 집계에서 빼면 사람마다 다른 숫자를 보게 된다.
  const blocked = await blockedUserIds(db, viewerId);
  const memberById = new Map(
    members.map((m) => [m.id, serializeMember(m)] as const),
  );
  const attendees = sharedRows.flatMap((l) => {
    const member = memberById.get(l.userId);
    if (!member || blocked.has(l.userId)) return [];
    return [
      {
        leaveId: l.id,
        userId: l.userId,
        name: member.name,
        rankLabel: member.rankLabel,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
        segments: segmentMap.get(l.id) ?? [],
      },
    ];
  });

  return {
    month,
    unit: serializeUnit(unit, members.length),
    days,
    leaves: calendarLeaves,
    attendees,
    blackouts: blackouts.map((b) => ({
      id: b.id,
      startDate: b.startDate,
      endDate: b.endDate,
      reason: b.reason,
    })),
  };
}

/** 구성원 목록(차단한 사람 제외). 출타 집계에서는 빼지 않는다. */
export async function listVisibleMembers(
  db: Db,
  unitId: string,
  viewerId: string,
) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.unitId, unitId))
    .orderBy(asc(users.name))
    .all();
  const blocked = await blockedUserIds(db, viewerId);
  return rows.filter((m) => !blocked.has(m.id)).map((m) => serializeMember(m));
}
