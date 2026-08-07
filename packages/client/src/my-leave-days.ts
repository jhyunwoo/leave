/**
 * 내 휴가를 "날짜 → 그날의 재원" 맵으로 펼친다.
 *
 * 사용처: 웹/네이티브 달력의 월 그리드. 셀 하나를 그릴 때 이 맵만 조회하면
 * 되므로, 셀마다 전체 휴가 목록을 훑는 O(날짜 × 휴가) 계산이 사라진다.
 * 맵에 없는 날짜는 내 휴가가 없는 날이고, 그룹 출타율만 보여준다.
 */
import {
  eachDate,
  isConfirmedLeaveStatus,
  segmentBalanceKey,
  type BalanceKey,
  type ISODate,
} from "@leave/shared";
import type { MyLeave } from "./types";

/** 달력 셀 하나가 알아야 하는 "그날 내 휴가"의 전부. */
export type MyLeaveDay = {
  /** 그날 쓰는 재원(연가·정기외박 등). 칩 색을 정한다. */
  key: BalanceKey;
  title: string;
  /** 같은 재원 구간의 첫날/마지막날. 달력에서 칩을 이어 붙여 그릴 때 쓴다. */
  isSegmentStart: boolean;
  isSegmentEnd: boolean;
  /**
   * 확정(승인·복귀완료)인지. 희망 일정을 확정으로 오해하면 계획 전체가 어긋나므로
   * 색 외의 수단(테두리)으로도 구분한다.
   */
  isConfirmed: boolean;
  /** 초안은 나만 보이고 그룹 집계에 들어가지 않는다. */
  isDraft: boolean;
};

export function buildMyLeaveDayMap(
  leaves: readonly MyLeave[] | undefined,
): Map<ISODate, MyLeaveDay> {
  const map = new Map<ISODate, MyLeaveDay>();
  for (const leave of leaves ?? []) {
    for (const segment of leave.segments) {
      const key = segmentBalanceKey(segment);
      for (const date of eachDate(segment.startDate, segment.endDate)) {
        map.set(date, {
          key,
          title: leave.title,
          isSegmentStart: date === segment.startDate,
          isSegmentEnd: date === segment.endDate,
          isConfirmed: isConfirmedLeaveStatus(leave.status),
          isDraft: leave.status === "draft",
        });
      }
    }
  }
  return map;
}
