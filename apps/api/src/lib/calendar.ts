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
 *   나중에 이 응답을 캐싱한다면 캐시 키에 반드시 조회자 id와 차단 목록의 버전을
 *   포함해야 한다. 부대 단위로만 캐싱하면 남의 일정이 그대로 새어 나간다.
 */
import {
  computeDayStats,
  isCountedLeaveStatus,
  monthBounds,
} from "@leave/shared";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { leaves, unitBlackouts, units, userBlocks, users } from "../db/schema";
import type { Db } from "./db";
import { segmentsOfUnitDuring } from "./leave-balances";
import { serializeMember, serializeUnit } from "./serialize";

/**
 * 구성원 조회 투영.
 *
 * 예전에는 `select *`라 비밀번호 해시·소금·이메일까지 부대원 수만큼 읽었다.
 * 응답에 나가지도 않는 값이라 D1에서 읽을 이유가 없다.
 */
const memberColumns = {
  id: users.id,
  name: users.name,
  branch: users.branch,
  enlistedAt: users.enlistedAt,
  dischargeAt: users.dischargeAt,
  signupRank: users.signupRank,
} as const;

/** 달력·명단 응답에 나가는 휴가 컬럼만. */
const leaveColumns = {
  id: leaves.id,
  userId: leaves.userId,
  title: leaves.title,
  startDate: leaves.startDate,
  endDate: leaves.endDate,
  reason: leaves.reason,
  status: leaves.status,
} as const;

/** 조회자가 차단한 사용자 id 집합. */
function blockedUserIdsQuery(db: Db, viewerId: string) {
  return db
    .select({ id: userBlocks.blockedUserId })
    .from(userBlocks)
    .where(eq(userBlocks.userId, viewerId));
}

export async function buildCalendarPayloads(input: {
  db: Db;
  unitId: string;
  /** 이 응답을 받아 볼 사람. 내 일정 노출과 차단 반영의 기준이 된다. */
  viewerId: string;
  /** 중복 없는 YYYY-MM 목록. API에서 최대 9개월·연속 9개월 범위로 제한한다. */
  months: string[];
}) {
  const { db, unitId, viewerId, months } = input;
  if (months.length === 0) return [];
  const monthRanges = months.map((month) => ({
    month,
    ...monthBounds(month),
  }));
  const rangeStart = monthRanges.reduce(
    (earliest, range) => (range.start < earliest ? range.start : earliest),
    monthRanges[0]!.start,
  );
  const rangeEnd = monthRanges.reduce(
    (latest, range) => (range.end > latest ? range.end : latest),
    monthRanges[0]!.end,
  );

  /*
   * 다섯 조회는 서로를 기다릴 이유가 없다(모두 unitId·viewerId·기간만 있으면 된다).
   * 예전에는 부대원 id 목록을 먼저 뽑아 휴가 조회의 IN(...)에 넣느라 순서가 강제됐고,
   * 그 목록이 D1의 바인드 파라미터 상한(100개)을 넘으면 요청 자체가 죽었다 —
   * 부대원 99명이면 달력이 500이었다. 부대 조인으로 바꿔 상한을 없애고,
   * batch로 묶어 왕복을 다섯에서 하나로 줄인다.
   */
  const [unitRows, members, rows, blackouts, blockedRows] = await db.batch([
    db.select().from(units).where(eq(units.id, unitId)),
    db
      .select(memberColumns)
      .from(users)
      .where(eq(users.unitId, unitId))
      .orderBy(asc(users.name)),
    // 요청 달 범위에 하루라도 걸치는 휴가만 가져온다. 개별 달 응답은 아래에서
    // 다시 좁힌다. 연속 9개월 제한 덕분에 멀리 떨어진 두 달 사이를 통째로 읽지 않는다.
    db
      .select(leaveColumns)
      .from(leaves)
      .innerJoin(users, eq(leaves.userId, users.id))
      .where(
        and(
          eq(users.unitId, unitId),
          lte(leaves.startDate, rangeEnd),
          gte(leaves.endDate, rangeStart),
        ),
      )
      .orderBy(asc(leaves.startDate)),
    db
      .select({
        id: unitBlackouts.id,
        startDate: unitBlackouts.startDate,
        endDate: unitBlackouts.endDate,
        reason: unitBlackouts.reason,
      })
      .from(unitBlackouts)
      .where(
        and(
          eq(unitBlackouts.unitId, unitId),
          lte(unitBlackouts.startDate, rangeEnd),
          gte(unitBlackouts.endDate, rangeStart),
        ),
      )
      .orderBy(asc(unitBlackouts.startDate)),
    blockedUserIdsQuery(db, viewerId),
  ]);

  const unit = unitRows[0];
  if (!unit) return null;

  // 구간도 같은 조인으로 읽는다 — 휴가 id 목록을 IN(...)에 넣던 조회는 이 달의
  // 휴가가 100건을 넘는 순간(부대원 80명이면 흔하다) 파라미터 상한에 걸렸다.
  const segmentMap = await segmentsOfUnitDuring(db, {
    unitId,
    start: rangeStart,
    end: rangeEnd,
    viewerId,
  });

  const blocked = new Set(blockedRows.map((row) => row.id));
  const memberById = new Map(
    members.map((m) => [m.id, serializeMember(m)] as const),
  );
  const serializedUnit = serializeUnit(unit, members.length);

  return monthRanges.map(({ month, start, end }) => {
    const monthRows = rows.filter(
      (row) => row.startDate <= end && row.endDate >= start,
    );
    const monthBlackouts = blackouts.filter(
      (blackout) => blackout.startDate <= end && blackout.endDate >= start,
    );
    const isBlocked = (date: string) =>
      monthBlackouts.some(
        (blackout) => blackout.startDate <= date && date <= blackout.endDate,
      );
    const sharedRows = monthRows.filter((row) =>
      isCountedLeaveStatus(row.status),
    );

    const days = computeDayStats({
      // 초안(draft)과 반려·취소된 계획은 실제로 나가지 않으므로 집계에서 뺀다.
      leaves: sharedRows.map((leave) => ({
        userId: leave.userId,
        startDate: leave.startDate,
        endDate: leave.endDate,
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

    // 내 일정만 제목·사유·초안까지 담아 돌려준다.
    const calendarLeaves = monthRows
      .filter((row) => row.userId === viewerId)
      .map((leave) => ({
        id: leave.id,
        title: leave.title,
        startDate: leave.startDate,
        endDate: leave.endDate,
        reason: leave.reason,
        status: leave.status,
        segments: segmentMap.get(leave.id) ?? [],
      }));

    // 차단은 이 명단에서만 숨긴다. days 집계에서 빼면 사람마다 다른 숫자를 보게 된다.
    const attendees = sharedRows.flatMap((leave) => {
      const member = memberById.get(leave.userId);
      if (!member || blocked.has(leave.userId)) return [];
      return [
        {
          leaveId: leave.id,
          userId: leave.userId,
          name: member.name,
          rankLabel: member.rankLabel,
          startDate: leave.startDate,
          endDate: leave.endDate,
          status: leave.status,
          segments: segmentMap.get(leave.id) ?? [],
        },
      ];
    });

    return {
      month,
      unit: serializedUnit,
      days,
      leaves: calendarLeaves,
      attendees,
      blackouts: monthBlackouts,
    };
  });
}

/** 기존 단일 월 계약. 배치 조립기와 같은 경로를 타서 응답 의미가 어긋나지 않는다. */
export async function buildCalendarPayload(input: {
  db: Db;
  unitId: string;
  viewerId: string;
  month: string;
}) {
  const payloads = await buildCalendarPayloads({
    ...input,
    months: [input.month],
  });
  return payloads?.[0] ?? null;
}

/** 구성원 목록(차단한 사람 제외). 출타 집계에서는 빼지 않는다. */
export async function listVisibleMembers(
  db: Db,
  unitId: string,
  viewerId: string,
) {
  // 두 조회는 서로를 기다릴 이유가 없다 — 한 번의 왕복으로 묶는다.
  const [rows, blockedRows] = await db.batch([
    db
      .select(memberColumns)
      .from(users)
      .where(eq(users.unitId, unitId))
      .orderBy(asc(users.name)),
    blockedUserIdsQuery(db, viewerId),
  ]);
  const blocked = new Set(blockedRows.map((row) => row.id));
  return rows.filter((m) => !blocked.has(m.id)).map((m) => serializeMember(m));
}
