import { diffDays } from "./dates";
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

export const LEAVE_CATEGORY_LABELS: Record<LeaveCategory, string> = {
  annual: "연가",
  award: "포상휴가",
  compensation: "보상휴가",
  consolation: "위로휴가",
  petition: "청원휴가",
  sick: "병가",
  overnight: "외박",
  outing: "외출",
  other: "기타",
};

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

export type LeaveAllocation = {
  category: LeaveCategory;
  days: number;
  overnightKind?: OvernightKind;
};

export function allocationBalanceKey(
  allocation: Pick<LeaveAllocation, "category" | "overnightKind">,
): BalanceKey {
  if (allocation.category !== "overnight") return allocation.category;
  return allocation.overnightKind === "regular"
    ? "regular_overnight"
    : "other_overnight";
}

export function inclusiveDays(startDate: string, endDate: string): number {
  return diffDays(startDate, endDate) + 1;
}
