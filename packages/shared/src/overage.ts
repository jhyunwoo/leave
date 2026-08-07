/**
 * 하루 출타 인원 집계와 초과 판정 — 이 서비스의 존재 이유.
 *
 * 사용처:
 *  - 서버: 달력 응답의 일별 통계, 휴가 등록 시 초과 알림 대상 계산
 *  - 앱/웹: 휴가 등록 폼의 "이 계획을 더하면" 시뮬레이션
 *
 * 서버와 클라이언트가 같은 함수를 쓰기 때문에, 등록 전 미리보기와 등록 후 결과가
 * 어긋나지 않는다.
 */

import { addDays, eachDate, rangesOverlap, type ISODate } from "./dates";

/** 출타 인원 계산에 필요한 최소 휴가 정보. */
export interface LeaveSpan {
  userId: string;
  startDate: ISODate;
  endDate: ISODate;
}

/**
 * 하루에 허용되는 최대 출타 인원.
 * 부대 관리자가 지정한 값을 0 이상의 정수로 정규화한다.
 * 값이 없으면(구 버전 응답 등) 제한 없음이 아니라 0명으로 본다.
 */
export function maxAllowedOut(maxCount: number | null | undefined): number {
  if (maxCount == null) return 0;
  return Math.max(0, Math.floor(maxCount));
}

export interface DayStat {
  date: ISODate;
  /** 이 날짜에 휴가 중인 사용자 (중복 제거). */
  userIds: string[];
  count: number;
  allowed: number;
  exceeded: boolean;
}

/**
 * rangeStart~rangeEnd(포함) 각 날짜의 출타 인원과 초과 여부.
 * 같은 사용자가 겹치는 휴가를 여러 개 등록해도 1명으로 센다.
 */
export function computeDayStats(params: {
  leaves: LeaveSpan[];
  maxCount: number | null | undefined;
  rangeStart: ISODate;
  rangeEnd: ISODate;
  /**
   * 복귀일을 출타 인원으로 셀지 여부. 단, 시작일과 종료일이 같은 당일
   * 외출은 이 값과 무관하게 하루로 센다.
   */
  returnDayCounts?: boolean;
}): DayStat[] {
  const {
    leaves,
    maxCount,
    rangeStart,
    rangeEnd,
    returnDayCounts = true,
  } = params;
  const allowed = maxAllowedOut(maxCount);
  const byDate = new Map<ISODate, Set<string>>();
  for (const date of eachDate(rangeStart, rangeEnd)) {
    byDate.set(date, new Set());
  }
  for (const leave of leaves) {
    const effectiveEnd =
      returnDayCounts || leave.startDate === leave.endDate
        ? leave.endDate
        : addDays(leave.endDate, -1);
    if (!rangesOverlap(leave.startDate, effectiveEnd, rangeStart, rangeEnd)) {
      continue;
    }
    const from = leave.startDate > rangeStart ? leave.startDate : rangeStart;
    const to = effectiveEnd < rangeEnd ? effectiveEnd : rangeEnd;
    for (const date of eachDate(from, to)) {
      byDate.get(date)?.add(leave.userId);
    }
  }
  return [...byDate.entries()].map(([date, users]) => ({
    date,
    userIds: [...users],
    count: users.size,
    allowed,
    exceeded: users.size > allowed,
  }));
}

/**
 * 휴가(newLeave)가 반영된 전체 휴가 목록(leaves)에서, newLeave 기간 중
 * 최대 출타 인원을 초과하는 날짜 목록. 알림 발송 대상 날짜 계산에 사용.
 */
export function findExceededDates(params: {
  /** newLeave를 포함한 부대 전체 휴가. */
  leaves: LeaveSpan[];
  newLeave: { startDate: ISODate; endDate: ISODate };
  maxCount: number | null | undefined;
  returnDayCounts?: boolean;
}): ISODate[] {
  return computeDayStats({
    leaves: params.leaves,
    maxCount: params.maxCount,
    rangeStart: params.newLeave.startDate,
    rangeEnd: params.newLeave.endDate,
    returnDayCounts: params.returnDayCounts,
  })
    .filter((s) => s.exceeded)
    .map((s) => s.date);
}

/** 주어진 날짜들 중 하루라도 휴가가 겹치는 사용자 ID 목록(중복 제거). */
export function usersOnLeaveDuring(
  leaves: LeaveSpan[],
  dates: ISODate[],
): string[] {
  const users = new Set<string>();
  for (const leave of leaves) {
    for (const date of dates) {
      if (leave.startDate <= date && date <= leave.endDate) {
        users.add(leave.userId);
        break;
      }
    }
  }
  return [...users];
}
