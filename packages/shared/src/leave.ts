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
