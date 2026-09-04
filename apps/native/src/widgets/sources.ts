/**
 * 쿼리 응답을 위젯이 쓰는 재료(`WidgetSource`)로 좁힌다. 순수 함수.
 *
 * 사용처: widget-sync.native.tsx. 테스트는 apps/native/test/widget-source.test.ts.
 *
 * 화면 하나가 쓰는 응답 네댓 개에서 위젯에 필요한 조각만 뽑는 자리다. 이 일을
 * 컴포넌트 안에서 하면 "왜 이 휴가를 골랐는가" 같은 판단이 렌더 함수에 숨어
 * 테스트할 수 없게 된다.
 */

import { addDays, type ISODate } from "@leave/shared/dates";
import { dutyDaysBetween, type DateRange } from "@leave/shared/duty-days";
import { isCountedLeaveStatus } from "@leave/shared/leave";
import { summarizeHoldings } from "@leave/client/leave-holdings";
import type {
  Calendar,
  DutyDays,
  LeaveBalanceSummary,
  Me,
  MyLeave,
} from "@leave/client/types";
import type { WidgetPreferences } from "./preferences";
import type { WidgetSource, WidgetState } from "./payload";

export type WidgetSourceInput = {
  state: WidgetState;
  today: ISODate;
  me: Me | undefined;
  dutyDays: DutyDays | undefined;
  leaves: readonly MyLeave[] | undefined;
  balances: LeaveBalanceSummary | undefined;
  /** 위젯 창(오늘~13일 뒤)에 걸치는 달들. 아직 못 받은 달은 undefined. */
  calendars: readonly (Calendar | undefined)[];
  preferences: WidgetPreferences;
};

/** 부대가 쉬는 날로 등록한 구간. */
function unitHolidaysOf(
  calendars: readonly (Calendar | undefined)[],
): DateRange[] {
  const ranges: DateRange[] = [];
  const seen = new Set<string>();
  for (const calendar of calendars) {
    for (const event of calendar?.events ?? []) {
      if (!event.isHoliday) continue;
      // 한 일정이 두 달 응답에 함께 실려 온다 — id로 한 번만 센다.
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      ranges.push({ startDate: event.startDate, endDate: event.endDate });
    }
  }
  return ranges;
}

/**
 * 일과일에서 뺄 "나가 있는 구간".
 *
 * 서버(`apps/api/src/lib/duty-days.ts`)와 같은 규칙을 쓴다 — 집계 대상 상태이고,
 * **외출은 제외한다.** 외출은 같은 날 복귀하므로 그날 일과가 사라지지 않는다.
 * 구간이 없는 휴가는 휴가 자체의 날짜 범위로 대신한다.
 */
function leaveRangesOf(leaves: readonly MyLeave[]): DateRange[] {
  const ranges: DateRange[] = [];
  for (const leave of leaves) {
    if (!isCountedLeaveStatus(leave.status)) continue;
    const segments = leave.segments ?? [];
    if (segments.length === 0) {
      ranges.push({ startDate: leave.startDate, endDate: leave.endDate });
      continue;
    }
    for (const segment of segments) {
      if (segment.category === "outing") continue;
      ranges.push({ startDate: segment.startDate, endDate: segment.endDate });
    }
  }
  return ranges;
}

/**
 * 출타 여유를 물어볼 날 — **아직 오지 않은** 가장 빠른 휴가의 첫날.
 *
 * 이미 나가 있는 휴가는 그 첫날이 지난 날이라 "몇 명 더 갈 수 있나"를 물어도
 * 뜻이 없다. 그래서 오늘 이후로 시작하는 휴가만 본다.
 */
function nextDepartureDate(
  leaves: readonly MyLeave[],
  today: ISODate,
): ISODate | null {
  let earliest: ISODate | null = null;
  for (const leave of leaves) {
    if (!isCountedLeaveStatus(leave.status)) continue;
    if (leave.startDate < today) continue;
    if (earliest === null || leave.startDate < earliest) {
      earliest = leave.startDate;
    }
  }
  return earliest;
}

export function buildWidgetSource(input: WidgetSourceInput): WidgetSource {
  const { today, preferences } = input;
  const leaves = input.leaves ?? [];
  const unitHolidays = unitHolidaysOf(input.calendars);
  const leaveRanges = leaveRangesOf(leaves);

  // 서버가 센 날이 오늘이 아닐 수 있다 — 어제 받아 둔 캐시로 앱을 켠 경우다.
  // 같은 규칙으로 그 사이에 보낸 일과일만 빼면 오늘 값이 된다.
  const rawDutyDays = input.dutyDays;
  const dutyDaysToday = rawDutyDays
    ? Math.max(
        rawDutyDays.dutyDays -
          dutyDaysBetween({
            from: rawDutyDays.from,
            through: addDays(today, -1),
            unitHolidays,
            leaves: leaveRanges,
          }),
        0,
      )
    : null;

  const departure = nextDepartureDate(leaves, today);
  const dayStat = departure
    ? (input.calendars
        .flatMap((calendar) => calendar?.days ?? [])
        .find((day) => day.date === departure) ?? null)
    : null;

  const user = input.me?.user;

  return {
    state: input.state,
    today,
    profile: user
      ? {
          enlistedAt: user.enlistedAt,
          dischargeAt: user.dischargeAt,
          rank: user.rank,
        }
      : null,
    dutyDaysToday,
    leaves,
    unitHolidays,
    leaveRanges,
    snapshot: {
      holdings: input.balances
        ? summarizeHoldings(input.balances.balances)
        : null,
      headroom: dayStat
        ? {
            date: dayStat.date,
            count: dayStat.count,
            allowed: dayStat.allowed,
            blocked: dayStat.blocked,
          }
        : null,
    },
    defaultMetric: preferences.defaultMetric,
    summaryMetrics: preferences.summaryMetrics,
  };
}
