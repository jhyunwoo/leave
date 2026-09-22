/**
 * 남은 일과일 계산에 필요한 두 표를 읽어 규칙에 넘긴다.
 *
 * 사용처: GET /auth/me/duty-days (apps/api/src/routes/auth.ts).
 *
 * 왜 서버가 세는가 — 세 조각 중 두 개가 클라이언트에 없다. 부대 휴일은
 * `GET /units/{id}/calendar`로만 읽히는데 그 응답은 달 단위(한 번에 최대 9개월)에
 * 출타 명단·통계까지 실려 나간다. 남은 복무 기간이 18개월이면 앱이 이 숫자 하나를
 * 그리려고 무거운 달력 응답을 세 번 받아야 한다. 서버에서는 기간으로 좁힌 두
 * 조회를 batch 하나로 끝낸다.
 *
 * 세는 규칙 자체는 packages/shared/src/duty-days.ts에 있다 — 서버·앱·웹이
 * 같은 정의를 봐야 하고, 경계값(전역일 당일, 겹치는 휴가)은 그쪽 테스트가 지킨다.
 */
import {
  COUNTED_LEAVE_STATUSES,
  lastDutyDayCandidate,
  normalizeLegacyDischargeDate,
  remainingDutyDays,
  todayInSeoul,
} from "@leave/shared";
import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { leaveSegments, leaves, unitEvents, type UserRow } from "../db/schema";
import type { Db } from "./db";

export interface DutyDaysResult {
  dutyDays: number;
  /** 세기 시작한 날(한국 시간 기준 오늘). */
  from: string;
  /** 마지막으로 센 날 = 전역 전날. `from`보다 이르면 남은 일과일이 없다는 뜻이다. */
  through: string;
}

type DutyUser = Pick<
  UserRow,
  "id" | "unitId" | "enlistedAt" | "branch" | "dischargeAt"
>;

export async function readRemainingDutyDays(
  db: Db,
  user: DutyUser,
  today: string = todayInSeoul(),
): Promise<DutyDaysResult> {
  const results = await readRemainingDutyDaysForUsers(db, [user], today);
  return results.get(user.id)!;
}

/** 친구별 왕복을 만들지 않고 D1의 100개 바인딩 상한 안에서 묶어 읽는다. */
export async function readRemainingDutyDaysForUsers(
  db: Db,
  people: readonly DutyUser[],
  today: string = todayInSeoul(),
): Promise<Map<string, DutyDaysResult>> {
  const results = new Map<string, DutyDaysResult>();
  const active = people.flatMap((user) => {
    const dischargeAt = normalizeLegacyDischargeDate(
      user.enlistedAt,
      user.branch,
      user.dischargeAt,
    );
    const through = lastDutyDayCandidate(dischargeAt);
    if (through < today) {
      results.set(user.id, { dutyDays: 0, from: today, through });
      return [];
    }
    return [{ ...user, dischargeAt, through }];
  });
  for (let offset = 0; offset < active.length; offset += 90) {
    const chunk = active.slice(offset, offset + 90);
    const through = chunk.reduce(
      (last, user) => (user.through > last ? user.through : last),
      today,
    );
    const unitIds = [...new Set(chunk.map((user) => user.unitId ?? ""))];
    const [unitHolidays, leaveRanges] = await db.batch([
      db
        .select({
          unitId: unitEvents.unitId,
          startDate: unitEvents.startDate,
          endDate: unitEvents.endDate,
        })
        .from(unitEvents)
        .where(
          and(
            inArray(unitEvents.unitId, unitIds),
            eq(unitEvents.isHoliday, true),
            lte(unitEvents.startDate, through),
            gte(unitEvents.endDate, today),
          ),
        ),
      // 외출은 일과가 사라지지 않으므로 부대 출타 집계 설정과 무관하게 제외한다.
      db
        .select({
          userId: leaves.userId,
          startDate: leaveSegments.startDate,
          endDate: leaveSegments.endDate,
        })
        .from(leaveSegments)
        .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
        .where(
          and(
            inArray(
              leaves.userId,
              chunk.map((user) => user.id),
            ),
            inArray(leaves.status, [...COUNTED_LEAVE_STATUSES]),
            ne(leaveSegments.category, "outing"),
            lte(leaveSegments.startDate, through),
            gte(leaveSegments.endDate, today),
          ),
        ),
    ]);
    for (const user of chunk) {
      results.set(user.id, {
        dutyDays: remainingDutyDays({
          from: today,
          dischargeAt: user.dischargeAt,
          unitHolidays: unitHolidays.filter(
            (holiday) => holiday.unitId === user.unitId,
          ),
          leaves: leaveRanges.filter((leave) => leave.userId === user.id),
        }),
        from: today,
        through: user.through,
      });
    }
  }
  return results;
}
