/**
 * 휴가 "적립분"(grant) — 사용자가 실제로 받은 휴가 한 건.
 *
 * 같은 재원이라도 받은 건마다 사용 만기가 다를 수 있다("포상휴가 3일은 8/31까지,
 * 나머지 2일은 만기 없음"). 그래서 재원별 숫자 하나가 아니라 적립분 목록으로 들고,
 * 재원 총량은 그 합이다.
 *
 * 사용량을 어느 적립분에 다는지는 아래 규칙으로 정한다(군 규정이 아니라 이 앱이 고른
 * 회계 관행이므로 화면에도 밝혀 둔다):
 *
 *   사용한 날짜를 오름차순으로 훑으며, 그날 유효한(부여일 이후이고 아직 만기 전인)
 *   적립분 중 **만기가 가장 이른 것**부터 하루씩 차감한다. 만기가 없는 적립분은 맨 뒤.
 *
 * 만기 임박분부터 쓰는 이 규칙(EDF)은 "가능한 배분이 있으면 반드시 찾아낸다"는 점에서
 * 최적이다. 단순히 받은 순서대로(FIFO) 빼면 1월에 쓴 휴가를 3월에 받은 적립분에 다는
 * 엉뚱한 결과가 나오므로 날짜순으로 훑는 것이 핵심이다.
 *
 * 어느 적립분으로도 설명되지 않는 사용분은 unattributed로 남긴다. 새 휴가를 등록할 때는
 * 이 값이 늘어나면 거절하고, 이미 쌓인 것은 화면에서 경고로만 알린다.
 */

import { addDays, diffDays, type ISODate } from "./dates";
import { BALANCE_KEYS, segmentBalanceKey, type BalanceKey } from "./leave";
import type { SegmentLike } from "./regular-overnight";

/** 아무리 긴 기간을 물어봐도 폭주하지 않도록 두는 사용일 상한. */
export const MAX_USAGE_DAYS = 4000;

/** 만기가 없는 적립분을 정렬 맨 뒤로 보내기 위한 경계값. */
const NO_EXPIRY = "9999-12-31";
/** 부여일이 없는 적립분을 정렬 맨 앞으로 보내기 위한 경계값. */
const NO_GRANTED_ON = "0000-01-01";

/** 만기 임박으로 볼 기본 기간(일). */
export const EXPIRING_SOON_DAYS = 30;

export type GrantStatus = "future" | "active" | "expired";

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  future: "적립 예정",
  active: "사용 가능",
  expired: "만료됨",
};

export type LeaveGrant = {
  id: string;
  balanceKey: BalanceKey;
  days: number;
  /** 부여일 — 이 날부터 쓸 수 있다. null이면 시작 제한 없음. */
  grantedOn: ISODate | null;
  /** 사용 만기 기한(이 날까지 포함). null이면 만료되지 않는다. */
  expiresOn: ISODate | null;
  note?: string | null;
  createdAt?: string;
};

export type GrantAllocation = {
  grant: LeaveGrant;
  /** 이 적립분에서 빠져나간 일수. */
  usedDays: number;
  /** 아직 쓰지 않은 일수 (days - usedDays). */
  unusedDays: number;
  /** 오늘 기준 지금 쓸 수 있는 일수. active가 아니면 0. */
  availableDays: number;
  status: GrantStatus;
  /** 오늘 기준 만기까지 남은 일수. 만기가 없으면 null. 만료됐으면 음수. */
  daysUntilExpiry: number | null;
};

export type BalanceAllocation = {
  balanceKey: BalanceKey;
  /** 받은 모든 적립분의 합 (만료·예정 포함). */
  totalDays: number;
  /** 이 재원으로 실제 쓴 총 일수 (배분된 일수 + unattributedDays). */
  usedDays: number;
  /** 오늘 기준 쓸 수 있는 잔여. 만료·예정 적립분은 빠진다. */
  remainingDays: number;
  /** 만료된 적립분 중 못 쓰고 날린 일수. */
  expiredDays: number;
  /** 아직 부여일이 오지 않은 적립분의 미사용분. */
  upcomingDays: number;
  /** 어떤 적립분으로도 설명되지 않는 사용 일수. */
  unattributedDays: number;
  /** 위 일수에 해당하는 날짜(앞에서 최대 5개). 오류 메시지에 쓴다. */
  unattributedDates: ISODate[];
  grants: GrantAllocation[];
};

/** 오늘 기준 이 적립분을 지금 쓸 수 있는지. */
export function grantStatus(grant: LeaveGrant, today: ISODate): GrantStatus {
  if (grant.grantedOn && today < grant.grantedOn) return "future";
  if (grant.expiresOn && today > grant.expiresOn) return "expired";
  return "active";
}

/** date에 이 적립분을 쓸 수 있는지. 부여일 이후이고 만기 전이어야 한다. */
function isUsableOn(grant: LeaveGrant, date: ISODate): boolean {
  if (grant.grantedOn && date < grant.grantedOn) return false;
  if (grant.expiresOn && date > grant.expiresOn) return false;
  return true;
}

/**
 * 배분 순서를 결정적으로 만드는 키. 만기 → 부여일 → 생성 시각 → id 순으로 본다.
 * 새로고침마다 귀속이 달라지면 사용자가 화면의 숫자를 믿지 않으므로 동점 처리까지 못박는다.
 */
function orderKey(grant: LeaveGrant): [string, string, string, string] {
  return [
    grant.expiresOn ?? NO_EXPIRY,
    grant.grantedOn ?? NO_GRANTED_ON,
    grant.createdAt ?? "",
    grant.id,
  ];
}

function compareGrants(a: LeaveGrant, b: LeaveGrant): number {
  const left = orderKey(a);
  const right = orderKey(b);
  for (let i = 0; i < left.length; i += 1) {
    const cmp = left[i]!.localeCompare(right[i]!);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/** 표시 순서: 만기 빠른 순 → 부여일 → 생성 순. 만기 없는 건 맨 뒤. */
export function sortGrantsForDisplay(
  grants: readonly LeaveGrant[],
): LeaveGrant[] {
  return [...grants].sort(compareGrants);
}

/** 오늘 기준 만기가 withinDays 안으로 다가온 적립분인지. 이미 만료됐으면 false. */
export function isExpiringSoon(
  grant: LeaveGrant,
  today: ISODate,
  withinDays: number = EXPIRING_SOON_DAYS,
): boolean {
  if (!grant.expiresOn) return false;
  if (grantStatus(grant, today) !== "active") return false;
  return diffDays(today, grant.expiresOn) <= withinDays;
}

/** 구간들을 날짜 하나하나로 펼쳐 오름차순 정렬한다. 상한을 넘으면 잘라낸다. */
function usageDates(usages: readonly SegmentLike[]): ISODate[] {
  const dates: ISODate[] = [];
  for (const usage of usages) {
    for (
      let date = usage.startDate;
      date <= usage.endDate && dates.length < MAX_USAGE_DAYS;
      date = addDays(date, 1)
    ) {
      dates.push(date);
    }
  }
  return dates.sort();
}

/**
 * 재원 하나의 적립분에 사용 날짜를 배분한다.
 * usages는 이 재원에 해당하는 구간만 담겨 있다고 가정하지 않고 여기서 걸러낸다.
 */
export function allocateBalanceGrants(
  balanceKey: BalanceKey,
  grants: readonly LeaveGrant[],
  usages: readonly SegmentLike[],
  today: ISODate,
): BalanceAllocation {
  const mine = sortGrantsForDisplay(
    grants.filter((grant) => grant.balanceKey === balanceKey),
  );
  const dates = usageDates(
    usages.filter(
      (usage) =>
        segmentBalanceKey({
          category: usage.category,
          overnightKind: usage.overnightKind ?? undefined,
        }) === balanceKey,
    ),
  );

  // mine은 이미 만기 빠른 순이므로, 그날 쓸 수 있는 첫 적립분이 곧 만기가 가장 이른 것이다.
  const consumed = new Map<string, number>();
  const unattributedDates: ISODate[] = [];
  let unattributedDays = 0;

  for (const date of dates) {
    const grant = mine.find(
      (candidate) =>
        isUsableOn(candidate, date) &&
        (consumed.get(candidate.id) ?? 0) < candidate.days,
    );
    if (!grant) {
      unattributedDays += 1;
      if (unattributedDates.length < 5) unattributedDates.push(date);
      continue;
    }
    consumed.set(grant.id, (consumed.get(grant.id) ?? 0) + 1);
  }

  let totalDays = 0;
  let remainingDays = 0;
  let expiredDays = 0;
  let upcomingDays = 0;

  const allocations: GrantAllocation[] = mine.map((grant) => {
    const usedDays = consumed.get(grant.id) ?? 0;
    const unusedDays = grant.days - usedDays;
    const status = grantStatus(grant, today);
    const availableDays = status === "active" ? unusedDays : 0;

    totalDays += grant.days;
    if (status === "active") remainingDays += unusedDays;
    else if (status === "expired") expiredDays += unusedDays;
    else upcomingDays += unusedDays;

    return {
      grant,
      usedDays,
      unusedDays,
      availableDays,
      status,
      daysUntilExpiry: grant.expiresOn
        ? diffDays(today, grant.expiresOn)
        : null,
    };
  });

  return {
    balanceKey,
    totalDays,
    usedDays: dates.length,
    remainingDays,
    expiredDays,
    upcomingDays,
    unattributedDays,
    unattributedDates,
    grants: allocations,
  };
}

/** 모든 재원에 대해 한 번에 배분한다. 재원별로 서로 영향을 주지 않는다. */
export function allocateAllGrants(
  grants: readonly LeaveGrant[],
  segments: readonly SegmentLike[],
  today: ISODate,
): Record<BalanceKey, BalanceAllocation> {
  const result = {} as Record<BalanceKey, BalanceAllocation>;
  for (const key of BALANCE_KEYS) {
    result[key] = allocateBalanceGrants(key, grants, segments, today);
  }
  return result;
}

/**
 * 구버전 `{totals}` API를 적립분 모델에 얹기 위한 순수 계획 함수.
 *
 * "포상휴가를 5일로"가 어느 적립분을 뜻하는지는 알 수 없으므로 관행을 정한다:
 * 늘릴 때는 만기 없는 **기본 적립분** 하나만 키우고, 줄일 때는 기본 적립분부터
 * 그다음 만기가 늦은 것부터 흡수한다(만기 임박분은 최대한 남긴다).
 * 어떤 적립분도 자기 사용분 아래로는 내려가지 않는다.
 */
export type GrantMutation =
  | { kind: "create"; balanceKey: BalanceKey; days: number }
  | { kind: "update"; id: string; days: number }
  | { kind: "delete"; id: string };

export type TotalChangePlan =
  | { ok: true; mutations: GrantMutation[] }
  | { ok: false; minimumTotal: number };

/** 만기·부여일이 모두 없는, 가장 먼저 만들어진 적립분. 총량 API가 다루는 대상. */
function baseGrantOf(allocation: BalanceAllocation): GrantAllocation | null {
  const candidates = allocation.grants.filter(
    (entry) => !entry.grant.expiresOn && !entry.grant.grantedOn,
  );
  return candidates[0] ?? null;
}

export function planTotalChange(
  allocation: BalanceAllocation,
  targetTotal: number,
): TotalChangePlan {
  if (targetTotal < allocation.usedDays) {
    return { ok: false, minimumTotal: allocation.usedDays };
  }
  const delta = targetTotal - allocation.totalDays;
  if (delta === 0) return { ok: true, mutations: [] };

  if (delta > 0) {
    const base = baseGrantOf(allocation);
    return {
      ok: true,
      mutations: [
        base
          ? { kind: "update", id: base.grant.id, days: base.grant.days + delta }
          : {
              kind: "create",
              balanceKey: allocation.balanceKey,
              days: delta,
            },
      ],
    };
  }

  // 줄이는 순서: 기본 적립분 → 만기 늦은 것 → … (만기 임박분을 최대한 살린다)
  const base = baseGrantOf(allocation);
  const rest = allocation.grants
    .filter((entry) => entry.grant.id !== base?.grant.id)
    .sort((a, b) =>
      (b.grant.expiresOn ?? NO_EXPIRY).localeCompare(
        a.grant.expiresOn ?? NO_EXPIRY,
      ),
    );
  const order = base ? [base, ...rest] : rest;

  const mutations: GrantMutation[] = [];
  let toRemove = -delta;
  for (const entry of order) {
    if (toRemove <= 0) break;
    // 이 적립분에 이미 달린 사용분 아래로는 못 내린다.
    const reducible = entry.grant.days - entry.usedDays;
    if (reducible <= 0) continue;
    const cut = Math.min(reducible, toRemove);
    const days = entry.grant.days - cut;
    mutations.push(
      days === 0
        ? { kind: "delete", id: entry.grant.id }
        : { kind: "update", id: entry.grant.id, days },
    );
    toRemove -= cut;
  }
  return { ok: true, mutations };
}
