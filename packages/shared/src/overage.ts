import { eachDate, rangesOverlap, type ISODate } from "./dates";

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
}): DayStat[] {
  const { leaves, maxCount, rangeStart, rangeEnd } = params;
  const allowed = maxAllowedOut(maxCount);
  const byDate = new Map<ISODate, Set<string>>();
  for (const date of eachDate(rangeStart, rangeEnd)) {
    byDate.set(date, new Set());
  }
  for (const leave of leaves) {
    if (!rangesOverlap(leave.startDate, leave.endDate, rangeStart, rangeEnd)) {
      continue;
    }
    const from = leave.startDate > rangeStart ? leave.startDate : rangeStart;
    const to = leave.endDate < rangeEnd ? leave.endDate : rangeEnd;
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
}): ISODate[] {
  return computeDayStats({
    leaves: params.leaves,
    maxCount: params.maxCount,
    rangeStart: params.newLeave.startDate,
    rangeEnd: params.newLeave.endDate,
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
