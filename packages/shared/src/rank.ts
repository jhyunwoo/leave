import {
  addDays,
  addMonthsClamped,
  diffDays,
  parseISODate,
  toISODate,
  type ISODate,
} from "./dates";

export const BRANCHES = ["army", "navy", "air_force"] as const;
export type Branch = (typeof BRANCHES)[number];

export const BRANCH_LABELS: Record<Branch, string> = {
  army: "육군",
  navy: "해군",
  air_force: "공군",
};

/** 표준 복무기간(개월). 전역 예정일 기본값 제안에 사용. */
export const SERVICE_MONTHS: Record<Branch, number> = {
  army: 18,
  navy: 20,
  air_force: 21,
};

/**
 * 표준 의무복무 만료일.
 *
 * 월 단위 기간은 입대일에 해당하는 날의 전날에 끝나며, 마지막 달에
 * 해당일이 없으면 그 달의 말일에 끝난다(예: 8/31 + 18개월 → 2/28 또는 2/29).
 * 실제 전역일은 군기교육ㆍ복무이탈ㆍ전역보류 등에 따라 달라질 수 있다.
 */
export function standardDischargeDate(
  enlistedAt: ISODate,
  branch: Branch,
): ISODate {
  const correspondingDate = addMonthsClamped(
    enlistedAt,
    SERVICE_MONTHS[branch],
  );
  const enlistedDay = Number(enlistedAt.slice(8, 10));
  const correspondingDay = Number(correspondingDate.slice(8, 10));

  return correspondingDay < enlistedDay
    ? correspondingDate
    : addDays(correspondingDate, -1);
}

/** 이전 자동 계산값(+복무 개월)을 저장한 계정만 올바른 만료일로 보정한다. */
export function normalizeLegacyDischargeDate(
  enlistedAt: ISODate,
  branch: Branch,
  dischargeAt: ISODate,
): ISODate {
  const legacyDefault = addMonthsClamped(enlistedAt, SERVICE_MONTHS[branch]);
  return dischargeAt === legacyDefault
    ? standardDischargeDate(enlistedAt, branch)
    : dischargeAt;
}

export const RANKS = [
  "private",
  "private_first",
  "corporal",
  "sergeant",
] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_LABELS: Record<Rank, string> = {
  private: "이병",
  private_first: "일병",
  corporal: "상병",
  sergeant: "병장",
};

/**
 * 계급별 진급 시점(입대 후 누적 개월, 전 군 공통).
 * 2021년 개정 병 진급 최저복무기간: 이병 2개월 → 일병 6개월 → 상병 6개월 → 병장.
 */
export const PROMOTION_MONTHS: Record<Rank, number> = {
  private: 0,
  private_first: 2,
  corporal: 8,
  sergeant: 14,
};

/** 진급 최저복무기간이 지난 뒤 처음 도래하는 정기 진급일(매월 1일). */
export function standardPromotionDate(
  enlistedAt: ISODate,
  rank: Rank,
): ISODate {
  if (rank === "private") return enlistedAt;

  const eligibleAt = addMonthsClamped(enlistedAt, PROMOTION_MONTHS[rank]);
  const eligible = parseISODate(eligibleAt);
  if (eligible.getUTCDate() === 1) return eligibleAt;

  return toISODate(
    new Date(
      Date.UTC(eligible.getUTCFullYear(), eligible.getUTCMonth() + 1, 1),
    ),
  );
}

export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

/** 표준 진급 일정만으로 계산한 계급. */
export function scheduledRank(enlistedAt: ISODate, on: ISODate): Rank {
  let rank: Rank = "private";
  for (const r of RANKS) {
    if (on >= standardPromotionDate(enlistedAt, r)) rank = r;
  }
  return rank;
}

/**
 * 현재 계급. 표준 일정으로 자동 진급하되,
 * 가입 시 등록한 계급이 더 높으면 그 계급을 하한으로 유지한다(조기 진급자 대응).
 */
export function currentRank(params: {
  enlistedAt: ISODate;
  signupRank: Rank;
  on: ISODate;
}): Rank {
  const scheduled = scheduledRank(params.enlistedAt, params.on);
  return rankIndex(params.signupRank) > rankIndex(scheduled)
    ? params.signupRank
    : scheduled;
}

/** 다음 진급 예정일. 병장이면 null. */
export function nextPromotionDate(params: {
  enlistedAt: ISODate;
  signupRank: Rank;
  on: ISODate;
}): ISODate | null {
  const current = currentRank(params);
  const idx = rankIndex(current);
  const next = RANKS[idx + 1];
  if (!next) return null;
  const date = standardPromotionDate(params.enlistedAt, next);
  return date > params.on ? date : null;
}

export interface RankInfo {
  rank: Rank;
  rankLabel: string;
  nextPromotionDate: ISODate | null;
  /** 복무 진행률 0~1. */
  serviceProgress: number;
  /** 전역까지 남은 일수(오늘 포함 안 함). 전역일이 지났으면 0. */
  daysUntilDischarge: number;
}

export function getRankInfo(params: {
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  signupRank: Rank;
  on: ISODate;
}): RankInfo {
  const { enlistedAt, dischargeAt, signupRank, on } = params;
  const rank = currentRank({ enlistedAt, signupRank, on });
  const total = Math.max(diffDays(enlistedAt, dischargeAt), 1);
  const served = diffDays(enlistedAt, on);
  return {
    rank,
    rankLabel: RANK_LABELS[rank],
    nextPromotionDate: nextPromotionDate({ enlistedAt, signupRank, on }),
    serviceProgress: Math.min(Math.max(served / total, 0), 1),
    daysUntilDischarge: Math.max(diffDays(on, dischargeAt), 0),
  };
}
