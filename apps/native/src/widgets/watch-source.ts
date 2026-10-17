/**
 * 애플워치가 아이폰·네트워크 없이도 지표를 스스로 세는 데 쓰는 재료.
 *
 * 타임라인은 14일치뿐이고, 워치가 셀룰러로 직접 받은 값은 받은 그날에 멈춘다.
 * 그래서 워치에는 완성된 숫자 대신 "날짜만 알면 숫자가 나오는" 재료를 함께 보낸다 —
 * 워치(`WatchMetrics.swift`)가 지금 시각으로 전역·복무율·일과일·다음 휴가/외출을 센다.
 *
 * 직렬화된 JSON은 워치의 `WatchSource`와 필드 이름이 같아야 한다.
 */
import { addDays, type ISODate } from "@leave/shared/dates";
import { dutyDaysBetween } from "@leave/shared/duty-days";
import { isCountedLeaveStatus } from "@leave/shared/leave";
import { isOutingLeave } from "@leave/client/next-leave-countdown";
import type { WidgetSource } from "./payload";

export type LeaveWatchSource = {
  enlistedAt: string | null;
  dischargeAt: string | null;
  /**
   * `from`의 남은 일과일이 `days`이고, `dates`는 `from`부터 전역 전날까지의 일과일
   * 날짜다. 워치는 날 d의 값을 `days − (from ≤ x < d인 dates 수)`로 센다 —
   * 위젯 타임라인(payload.ts `dutyDays`)과 같은 뺄셈이다.
   *
   * 아이폰이 가진 부대 휴일은 위젯 창(14일)뿐이라, 그 뒤의 부대 휴일은 `dates`에
   * 일과일로 남는다. 워치가 그만큼 오래 오프라인일 때만 드러나는 차이다.
   */
  dutyDays: { from: string; days: number; dates: string[] } | null;
  /** 아직 끝나지 않은 집계 대상 휴가·외출. 다음 휴가/외출 D-day를 여기서 센다. */
  leaves: {
    title: string;
    startDate: string;
    endDate: string;
    returnTime: string | null;
    outing: boolean;
  }[];
};

export function buildWatchSource(
  source: WidgetSource,
  today: ISODate,
): LeaveWatchSource {
  const { profile } = source;
  const dutyDates: ISODate[] = [];
  if (profile && source.dutyDaysToday !== null) {
    for (
      let date = today;
      date < profile.dischargeAt;
      date = addDays(date, 1)
    ) {
      const counted = dutyDaysBetween({
        from: date,
        through: date,
        unitHolidays: source.unitHolidays,
        leaves: source.leaveRanges,
      });
      if (counted > 0) dutyDates.push(date);
    }
  }
  return {
    enlistedAt: profile?.enlistedAt ?? null,
    dischargeAt: profile?.dischargeAt ?? null,
    dutyDays:
      profile && source.dutyDaysToday !== null
        ? { from: today, days: source.dutyDaysToday, dates: dutyDates }
        : null,
    leaves: source.leaves
      .filter(
        (leave) => isCountedLeaveStatus(leave.status) && leave.endDate >= today,
      )
      .map((leave) => ({
        title: leave.title,
        startDate: leave.startDate,
        endDate: leave.endDate,
        returnTime: leave.returnTime ?? null,
        outing: isOutingLeave(leave),
      })),
  };
}
