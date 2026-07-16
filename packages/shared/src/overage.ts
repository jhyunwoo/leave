import { eachDate, rangesOverlap, type ISODate } from "./dates";

/** 출타율 계산에 필요한 최소 휴가 정보. */
export interface LeaveSpan {
  userId: string;
  startDate: ISODate;
  endDate: ISODate;
}

/** 부대의 최대 출타율(비율). 예: 전체 인원의 1/3 → { numerator: 1, denominator: 3 } */
export interface LeaveRatio {
  numerator: number;
  denominator: number;
}

/** 하루에 허용되는 최대 출타 인원 = floor(부대원 수 × 비율). */
export function maxAllowedOut(memberCount: number, ratio: LeaveRatio): number {
  if (ratio.denominator <= 0) return 0;
  return Math.floor((memberCount * ratio.numerator) / ratio.denominator);
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
  memberCount: number;
  ratio: LeaveRatio;
  rangeStart: ISODate;
  rangeEnd: ISODate;
}): DayStat[] {
  const { leaves, memberCount, ratio, rangeStart, rangeEnd } = params;
  const allowed = maxAllowedOut(memberCount, ratio);
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
 * 출타율이 초과되는 날짜 목록. 알림 발송 대상 날짜 계산에 사용.
 */
export function findExceededDates(params: {
  /** newLeave를 포함한 부대 전체 휴가. */
  leaves: LeaveSpan[];
  newLeave: { startDate: ISODate; endDate: ISODate };
  memberCount: number;
  ratio: LeaveRatio;
}): ISODate[] {
  return computeDayStats({
    leaves: params.leaves,
    memberCount: params.memberCount,
    ratio: params.ratio,
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
