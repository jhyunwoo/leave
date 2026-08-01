import { eachDate, segmentBalanceKey, type BalanceKey } from "@leave/shared";
import type { MyLeave } from "../api/queries";

export type MyLeaveDay = {
  key: BalanceKey;
  title: string;
  /** 같은 재원 구간의 첫날/마지막날. 달력에서 칩을 이어 붙여 그릴 때 쓴다. */
  isSegmentStart: boolean;
  isSegmentEnd: boolean;
};

/**
 * 내 휴가를 날짜 → 그날의 재원으로 펼친다.
 * 달력 셀은 이 맵만 보면 되고, 없으면 지금처럼 부대 출타율만 보여준다.
 */
export function buildMyLeaveDayMap(
  leaves: readonly MyLeave[] | undefined,
): Map<string, MyLeaveDay> {
  const map = new Map<string, MyLeaveDay>();
  for (const leave of leaves ?? []) {
    for (const segment of leave.segments) {
      const key = segmentBalanceKey(segment);
      for (const date of eachDate(segment.startDate, segment.endDate)) {
        map.set(date, {
          key,
          title: leave.title,
          isSegmentStart: date === segment.startDate,
          isSegmentEnd: date === segment.endDate,
        });
      }
    }
  }
  return map;
}
