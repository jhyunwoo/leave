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

/** 재원별 사용 일수 합계. 휴가 잔여량 계산과 구버전 클라이언트 응답에 쓴다. */
export type LeaveAllocation = {
  category: LeaveCategory;
  days: number;
  overnightKind?: OvernightKind;
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

/** 구간 목록을 재원별 일수 합계로 접는다. */
export function segmentsToAllocations(
  segments: readonly LeaveSegment[],
): LeaveAllocation[] {
  const byKey = new Map<BalanceKey, LeaveAllocation>();
  for (const segment of segments) {
    const key = segmentBalanceKey(segment);
    const existing = byKey.get(key);
    if (existing) {
      existing.days += segment.days;
      continue;
    }
    byKey.set(key, {
      category: segment.category,
      days: segment.days,
      ...(segment.overnightKind
        ? { overnightKind: segment.overnightKind }
        : {}),
    });
  }
  return BALANCE_KEYS.map((key) => byKey.get(key)).filter(
    (item): item is LeaveAllocation => item != null,
  );
}

/**
 * 재원별 일수만 아는 옛 형식을 구간으로 편다. 시작일부터 BALANCE_KEYS 순서로 이어 붙인다.
 * 구간을 지원하지 않는 구버전 클라이언트 요청을 받아주기 위한 변환이며,
 * 옛 데이터 백필(migrations/0006)도 같은 순서를 쓴다.
 */
export function allocationsToSegments(
  startDate: ISODate,
  allocations: readonly LeaveAllocation[],
): LeaveSegment[] {
  const ordered = BALANCE_KEYS.flatMap((key) =>
    allocations.filter((allocation) => segmentBalanceKey(allocation) === key),
  );
  const segments: LeaveSegment[] = [];
  let cursor = startDate;
  for (const allocation of ordered) {
    const end = addDays(cursor, allocation.days - 1);
    segments.push({
      category: allocation.category,
      ...(allocation.overnightKind
        ? { overnightKind: allocation.overnightKind }
        : {}),
      startDate: cursor,
      endDate: end,
      days: allocation.days,
    });
    cursor = addDays(end, 1);
  }
  return segments;
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
