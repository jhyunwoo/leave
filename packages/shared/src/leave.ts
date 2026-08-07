/**
 * 휴가의 어휘 — 종류·상태·재원(BalanceKey)·구간(Segment)의 정의.
 *
 * 사용처: 서버 스키마와 저장, 앱/웹의 폼·목록·달력 전부.
 *
 * 휴가 한 건은 여러 "구간"으로 쪼개질 수 있다(예: 3일은 연가, 이어서 2일은
 * 위로휴가). 화면과 잔여 계산은 휴가가 아니라 구간 단위로 움직인다.
 * 재원 키(BalanceKey)는 그 구간이 어느 주머니에서 차감되는지를 가리킨다.
 */

import { diffDays, type ISODate } from "./dates";
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
  "outing",
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
  outing: "외출",
  other: "기타",
};

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
  startDate: ISODate;
  endDate: ISODate;
  days: number;
};

export function segmentBalanceKey(
  segment: Pick<LeaveSegment, "category" | "overnightKind">,
): BalanceKey {
  if (segment.category !== "overnight") return segment.category;
  return segment.overnightKind === "regular"
    ? "regular_overnight"
    : "other_overnight";
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
