/**
 * 휴가의 어휘 — 종류·상태·재원(BalanceKey)·구간(Segment)의 정의.
 *
 * 사용처: 서버 스키마와 저장, 앱/웹의 폼·목록·달력 전부.
 *
 * 휴가 한 건은 여러 "구간"으로 쪼개질 수 있다(예: 3일은 연가, 이어서 2일은
 * 위로휴가). 화면과 잔여 계산은 휴가가 아니라 구간 단위로 움직인다.
 * 재원 키(BalanceKey)는 그 구간이 어느 주머니에서 차감되는지를 가리킨다.
 */

import { addDays, diffDays, type ISODate } from "./dates";
import type { Branch } from "./rank";

export const LEAVE_CATEGORIES = [
  "annual",
  "award",
  "compensation",
  "consolation",
  "petition",
  "sick",
  "overnight",
  "outing",
  "other",
] as const;

export type LeaveCategory = (typeof LEAVE_CATEGORIES)[number];

export const OVERNIGHT_KINDS = ["regular", "other"] as const;
export type OvernightKind = (typeof OVERNIGHT_KINDS)[number];

/**
 * 외출의 갈래.
 *
 * 규정이 나누는 것이 아니라 **운용이 나눈다**. 부대관리훈령은 외출을 정기·특별·공용으로
 * 나눌 뿐이지만, 실제로 병사가 세는 단위는 "일과 후에 나가는 것"과 "휴일에 나가는 것"이고
 * 둘은 횟수도 시간도 따로 관리된다(육군 기준 평일 월 2회 · 주말 월 1회).
 * 한 주머니로 합치면 "이번 달 주말 외출을 썼는가"에 답할 수 없다.
 *
 * 값이 없는 구간은 평일로 읽는다 — 이 갈래가 생기기 전에 저장된 행들이다.
 */
export const OUTING_KINDS = ["weekday", "weekend"] as const;
export type OutingKind = (typeof OUTING_KINDS)[number];

/**
 * 휴가 한 건의 진행 상태.
 *
 * `draft`는 나만 보는 시뮬레이션이라 그룹 집계에도, 출타 명단에도 들어가지 않는다.
 * `shared`부터 `completed`까지는 집계에 반영되고, 같은 그룹 구성원에게 **이름·계급과
 * 함께** 날짜별 출타 명단으로 보인다(제목·사유 같은 자유 입력값은 공개하지 않는다).
 * `rejected`와 `cancelled`는 실제로 나가지 않으므로 집계에서 뺀다.
 */
export const LEAVE_STATUSES = [
  "draft",
  "shared",
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "completed",
] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** 사용자가 앱에서 직접 고를 수 있는 진행 상태. 종료 상태는 서버·관리 흐름이 맡는다. */
export const USER_EDITABLE_LEAVE_STATUSES = [
  "draft",
  "shared",
  "requested",
  "approved",
] as const satisfies readonly LeaveStatus[];

export type UserEditableLeaveStatus =
  (typeof USER_EDITABLE_LEAVE_STATUSES)[number];

export function isUserEditableLeaveStatus(
  status: LeaveStatus,
): status is UserEditableLeaveStatus {
  return (USER_EDITABLE_LEAVE_STATUSES as readonly LeaveStatus[]).includes(
    status,
  );
}

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  draft: "초안(나만 보기)",
  shared: "희망",
  requested: "신청함",
  approved: "확정",
  rejected: "반려",
  cancelled: "취소",
  completed: "복귀 완료",
};

/** 출타 집계에 들어가는 상태. 서버와 클라이언트가 같은 목록을 써야 숫자가 맞는다. */
export const COUNTED_LEAVE_STATUSES: readonly LeaveStatus[] = [
  "shared",
  "requested",
  "approved",
  "completed",
];

export function isCountedLeaveStatus(status: string): boolean {
  return (COUNTED_LEAVE_STATUSES as readonly string[]).includes(status);
}

/**
 * 내 잔여 휴가에서 빠지는 상태. 위의 출타 집계 목록과 **일부러 다르다.**
 *
 * 두 목록이 답하는 질문이 다르다.
 *  - `COUNTED_LEAVE_STATUSES`: "그날 그룹에서 몇 명이 나가는가" — 초안은 나만 보는
 *    계획이라 남의 출타율·명단에 들어가면 안 된다.
 *  - 이 목록: "내 통장에서 며칠이 빠지는가" — 초안도 내가 잡아 둔 계획이므로 빠진다
 *    (`plannedDays`가 바로 그 몫이다). 대신 `rejected`·`cancelled`는 실제로 나가지
 *    않으므로 일수가 돌아와야 한다.
 *
 * 예전에는 서버의 잔여 계산에 상태 조건이 아예 없어서 취소한 휴가가 계속 잔여를
 * 깎았고, 폼·달력은 `COUNTED_LEAVE_STATUSES`를 써서 층마다 다른 숫자가 나왔다.
 */
export const BALANCE_LEAVE_STATUSES: readonly LeaveStatus[] = [
  "draft",
  "shared",
  "requested",
  "approved",
  "completed",
];

export function countsAgainstBalance(status: string): boolean {
  return (BALANCE_LEAVE_STATUSES as readonly string[]).includes(status);
}

/** 확정(approved/completed)은 희망과 시각적으로 반드시 구분해야 한다. */
export function isConfirmedLeaveStatus(status: string): boolean {
  return status === "approved" || status === "completed";
}

export const BALANCE_KEYS = [
  "annual",
  "award",
  "compensation",
  "consolation",
  "petition",
  "sick",
  "regular_overnight",
  "other_overnight",
  // `outing`은 평일 외출이다. 갈래가 생기기 전부터 응답·적립분·구버전 앱에 실려 있는
  // 이름이라 그대로 둔다(docs/code-style.md — 프로세스를 벗어난 이름은 바꾸지 않는다).
  "outing",
  "weekend_outing",
  "other",
] as const;

export type BalanceKey = (typeof BALANCE_KEYS)[number];

export const BALANCE_LABELS: Record<BalanceKey, string> = {
  annual: "연가",
  award: "포상휴가",
  compensation: "보상휴가",
  consolation: "위로휴가",
  petition: "청원휴가",
  sick: "병가",
  regular_overnight: "정기외박",
  other_overnight: "기타 외박",
  outing: "평일 외출",
  weekend_outing: "주말 외출",
  other: "기타",
};

/**
 * 이 재원을 세는 단위.
 *
 * 외출은 **일이 아니라 횟수**다 — 당일 복귀라 하루가 통째로 사라지지 않고, 부대도
 * "월 2회"로 관리한다(duty-days.ts가 외출을 일과일에서 빼지 않는 것과 같은 사실).
 * 화면이 "잔여 2일"이라고 말하면 없는 휴가를 있다고 말하게 된다.
 */
export function balanceUnitLabel(key: BalanceKey): string {
  return key === "outing" || key === "weekend_outing" ? "회" : "일";
}

/** 국방부 안내 기준의 기본 제안값이며, 사용자가 프로필에서 자유롭게 수정한다. */
export const DEFAULT_ANNUAL_DAYS: Record<Branch, number> = {
  army: 24,
  navy: 27,
  air_force: 28,
};

/**
 * 휴가 한 건을 이루는 구간. "8/2~8/5는 연가, 8/6~8/9는 정기외박"처럼
 * 어느 날이 어떤 재원인지를 담는다. 한 휴가 안에서 같은 재원이 여러 번 나올 수 있고,
 * 구간들은 서로 겹치지 않으면서 휴가 전체 기간을 빈틈없이 덮어야 한다.
 */
export type LeaveSegment = {
  category: LeaveCategory;
  overnightKind?: OvernightKind;
  /** 외출 구간의 갈래. 없으면 평일로 읽는다. */
  outingKind?: OutingKind;
  startDate: ISODate;
  endDate: ISODate;
  days: number;
  /** 정기외박 전체 일수를 차감할 주기의 시작일. */
  regularOvernightCycleStart?: ISODate | null;
};

/**
 * 잔여량 계산에 필요한 구간 정보만 추린 형태.
 * DB 행은 갈래가 없을 때 null이라 undefined와 함께 받아들인다.
 */
export type SegmentLike = Pick<
  LeaveSegment,
  "category" | "startDate" | "endDate"
> & {
  overnightKind?: LeaveSegment["overnightKind"] | null;
  outingKind?: LeaveSegment["outingKind"] | null;
  regularOvernightCycleStart?: ISODate | null;
};

/**
 * 휴가 하나에 담을 수 있는 구간 수.
 *
 * 세 곳이 같은 수를 알아야 한다 — `leaveCreateSchema`가 거절하고, 폼이 "종류 더하기"를
 * 여기서 멈추고(서버에서 400을 받고 나서야 알게 되는 상한이면 안 된다),
 * 병합(`leave-merge.ts`)이 이 수를 넘기면 합치기를 포기한다. 그래서 낱개로 적지 않는다.
 */
export const MAX_LEAVE_SEGMENTS = 30;

export function segmentBalanceKey(
  segment: Pick<LeaveSegment, "category" | "overnightKind" | "outingKind">,
): BalanceKey {
  if (segment.category === "overnight") {
    return segment.overnightKind === "regular"
      ? "regular_overnight"
      : "other_overnight";
  }
  // 갈래가 비어 있으면 평일이다 — 갈래가 생기기 전에 저장된 구간이 여기로 온다.
  if (segment.category === "outing") {
    return segment.outingKind === "weekend" ? "weekend_outing" : "outing";
  }
  return segment.category;
}

export function inclusiveDays(startDate: string, endDate: string): number {
  return diffDays(startDate, endDate) + 1;
}

/** 시작일 → 종료일 순으로 정렬한 사본. 원본은 건드리지 않는다. */
export function sortSegments<
  T extends { startDate: ISODate; endDate: ISODate },
>(segments: readonly T[]): T[] {
  return [...segments].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.endDate.localeCompare(b.endDate),
  );
}

/**
 * 기준일까지 지나간 부분만 남기고 미래를 잘라낸 구간들. 원본은 건드리지 않는다.
 *
 * "오늘까지 실제로 쓴 휴가"를 셀 때 쓴다. 오늘 시작해 다음 주에 끝나는 휴가는 종료일을
 * 오늘로 당겨 그만큼만 세고, 아예 미래에 시작하는 구간은 통째로 빠진다.
 * 기준일 당일은 이미 나가 있는 날이므로 사용에 포함한다.
 */
export function clipSegmentsTo<
  T extends { startDate: ISODate; endDate: ISODate },
>(segments: readonly T[], date: ISODate): T[] {
  return segments
    .filter((segment) => segment.startDate <= date)
    .map((segment) =>
      segment.endDate <= date ? segment : { ...segment, endDate: date },
    );
}

/**
 * 모든 구간을 같은 일수만큼 통째로 민다. 원본은 건드리지 않는다.
 *
 * 달력에서 휴가를 끌어 다른 날짜로 옮길 때 쓴다. 구간의 순서·인접·길이·재원이 그대로
 * 보존되므로, 저장 전 상태가 유효했다면 옮긴 뒤에도 `leaveCreateSchema`의 불변식
 * (구간끼리 겹치지 않음 · 사이에 빈 날 없음 · 전체 기간 상한)이 그대로 성립한다.
 */
export function shiftSegments<
  T extends { startDate: ISODate; endDate: ISODate },
>(segments: readonly T[], days: number): T[] {
  if (days === 0) return [...segments];
  return segments.map((segment) => ({
    ...segment,
    startDate: addDays(segment.startDate, days),
    endDate: addDays(segment.endDate, days),
  }));
}

/** 그날에 해당하는 구간. 없으면 undefined. */
export function segmentOnDate<
  T extends { startDate: ISODate; endDate: ISODate },
>(segments: readonly T[], date: ISODate): T | undefined {
  return segments.find(
    (segment) => segment.startDate <= date && date <= segment.endDate,
  );
}

/** 구간들이 덮는 전체 기간. 빈 배열이면 null. */
export function segmentsRange(
  segments: readonly Pick<LeaveSegment, "startDate" | "endDate">[],
): { startDate: ISODate; endDate: ISODate } | null {
  if (!segments.length) return null;
  const sorted = sortSegments(segments);
  return {
    startDate: sorted[0]!.startDate,
    endDate: sorted.reduce(
      (latest, segment) =>
        segment.endDate > latest ? segment.endDate : latest,
      sorted[0]!.endDate,
    ),
  };
}
