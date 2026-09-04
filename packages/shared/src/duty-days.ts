/**
 * 남은 일과일 — 전역까지 실제로 부대에서 일과를 보낼 날의 수.
 *
 * 사용처: 서버의 GET /auth/me/duty-days, 그 값을 그리는 프로필·복무율 화면.
 *
 * "전역까지 D-450"은 달력을 그대로 센 값이라 체감과 멀다. 그중 실제로 일과가
 * 있는 날만 남기면 훨씬 작은 수가 나온다. 세는 규칙은 하나뿐이다 —
 * **평일에서 쉬는 날과 나가 있는 날을 뺀다.**
 *
 *  - 토·일과 공휴일은 애초에 일과일이 아니다.
 *  - 부대 휴일(`unit_events.is_holiday`)은 그 부대만의 쉬는 날이다.
 *  - 개인 휴가는 나가 있는 날이라 일과가 없다.
 *  - 전역일 당일은 일과일에서 뺀다. 그날은 부대를 나오는 날이지 일하는 날이 아니다.
 *
 * 세 종류의 "쉬는 날"은 서로 겹친다 — 연휴에 걸친 휴가, 주말을 낀 부대 휴일.
 * 그래서 "평일 수에서 각각을 뺀다"가 아니라 쉬는 날을 날짜 집합으로 모아 두고
 * 하루씩 훑으며 센다. 빼기로 접근하면 겹치는 날을 두 번 빼서 수가 모자란다.
 */

import { isWeekend } from "./calendar";
import { addDays, type ISODate } from "./dates";
import { isHoliday } from "./holidays";

/** 하루 이상 이어지는 구간. 부대 휴일과 휴가 구간이 같은 모양이라 함께 받는다. */
export interface DateRange {
  startDate: ISODate;
  endDate: ISODate;
}

export interface RemainingDutyDaysInput {
  /** 세기 시작하는 날(보통 오늘). 이 날이 평일이면 오늘도 일과일 하나로 센다. */
  from: ISODate;
  /** 전역 예정일. 이 날은 세지 않는다. */
  dischargeAt: ISODate;
  /** 부대가 지정한 휴일 구간. 부대에 속하지 않았으면 빈 배열. */
  unitHolidays: readonly DateRange[];
  /** 나가 있는 구간(집계 대상 휴가). 외출처럼 일과가 유지되는 구간은 넣지 않는다. */
  leaves: readonly DateRange[];
}

/**
 * 마지막으로 세는 날 — 전역 전날.
 * 오늘보다 이르면 셀 구간이 없다(오늘이 전역일이거나 이미 전역했다).
 */
export function lastDutyDayCandidate(dischargeAt: ISODate): ISODate {
  return addDays(dischargeAt, -1);
}

/** `from`~`through` 구간에 걸치는 부분만 남긴 날짜 집합. */
function datesCovered(
  ranges: readonly (readonly DateRange[])[],
  from: ISODate,
  through: ISODate,
): Set<ISODate> {
  const dates = new Set<ISODate>();
  for (const group of ranges) {
    for (const range of group) {
      const start = range.startDate < from ? from : range.startDate;
      const end = range.endDate > through ? through : range.endDate;
      for (let date = start; date <= end; date = addDays(date, 1)) {
        dates.add(date);
      }
    }
  }
  return dates;
}

/** 남은 일과일. 이미 전역했거나 셀 날이 없으면 0. */
export function remainingDutyDays(input: RemainingDutyDaysInput): number {
  const through = lastDutyDayCandidate(input.dischargeAt);
  if (through < input.from) return 0;

  const off = datesCovered(
    [input.unitHolidays, input.leaves],
    input.from,
    through,
  );

  let count = 0;
  for (let date = input.from; date <= through; date = addDays(date, 1)) {
    if (isWeekend(date) || isHoliday(date) || off.has(date)) continue;
    count += 1;
  }
  return count;
}
