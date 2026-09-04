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

export async function readRemainingDutyDays(
  db: Db,
  user: UserRow,
  today: string = todayInSeoul(),
): Promise<DutyDaysResult> {
  const dischargeAt = normalizeLegacyDischargeDate(
    user.enlistedAt,
    user.branch,
    user.dischargeAt,
  );
  const through = lastDutyDayCandidate(dischargeAt);
  if (through < today) return { dutyDays: 0, from: today, through };

  const [unitHolidays, leaveRanges] = await db.batch([
    db
      .select({
        startDate: unitEvents.startDate,
        endDate: unitEvents.endDate,
      })
      .from(unitEvents)
      .where(
        and(
          // 그룹에 참여하지 않은 사용자는 부대 휴일이 없다. 빈 문자열은 어떤
          // unit_id와도 같지 않으므로 인덱스 조회가 0행으로 끝난다 — 분기를 두어
          // batch를 쪼개는 것보다 왕복이 하나 적다.
          eq(unitEvents.unitId, user.unitId ?? ""),
          eq(unitEvents.isHoliday, true),
          lte(unitEvents.startDate, through),
          gte(unitEvents.endDate, today),
        ),
      ),
    // 구간(leave_segments)으로 읽는 이유는 외출을 빼기 위해서다. 외출은 같은 날
    // 복귀하므로 일과가 사라지지 않는다. 휴가 머리행만 보면 구분할 수 없다.
    db
      .select({
        startDate: leaveSegments.startDate,
        endDate: leaveSegments.endDate,
      })
      .from(leaveSegments)
      .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
      .where(
        and(
          eq(leaves.userId, user.id),
          inArray(leaves.status, [...COUNTED_LEAVE_STATUSES]),
          ne(leaveSegments.category, "outing"),
          lte(leaveSegments.startDate, through),
          gte(leaveSegments.endDate, today),
        ),
      ),
  ]);

  return {
    dutyDays: remainingDutyDays({
      from: today,
      dischargeAt,
      unitHolidays,
      leaves: leaveRanges,
    }),
    from: today,
    through,
  };
}
