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

export async function buildCalendarPayload(input: {
  db: Db;
  unitId: string;
  /** 이 응답을 받아 볼 사람. 내 일정 노출과 차단 반영의 기준이 된다. */
  viewerId: string;
  /** YYYY-MM */
  month: string;
}) {
  const { db, unitId, viewerId, month } = input;
  const { start, end } = monthBounds(month);

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
    // 이 달에 하루라도 걸치는 휴가만 가져온다(시작<=말일 && 종료>=1일).
    db
      .select(leaveColumns)
      .from(leaves)
      .innerJoin(users, eq(leaves.userId, users.id))
      .where(
        and(
          eq(users.unitId, unitId),
          lte(leaves.startDate, end),
          gte(leaves.endDate, start),
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
          lte(unitBlackouts.startDate, end),
          gte(unitBlackouts.endDate, start),
        ),
      )
      .orderBy(asc(unitBlackouts.startDate)),
    blockedUserIdsQuery(db, viewerId),
  ]);

  const unit = unitRows[0];
  if (!unit) return null;

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
  // 구간도 같은 조인으로 읽는다 — 휴가 id 목록을 IN(...)에 넣던 조회는 이 달의
  // 휴가가 100건을 넘는 순간(부대원 80명이면 흔하다) 파라미터 상한에 걸렸다.
  const segmentMap = await segmentsOfUnitDuring(db, {
    unitId,
    start,
    end,
    viewerId,
  });

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
  const blocked = new Set(blockedRows.map((row) => row.id));
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
    blackouts,
  };
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
