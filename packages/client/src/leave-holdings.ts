/**
 * 재원별 잔여를 "통장 한 줄"로 합친다.
 *
 * 사용처: 웹·네이티브의 내 휴가 화면과 네이티브 달력의 요약 패널.
 *
 * 이 셈은 세 화면에 각각 적혀 있었는데, 규칙이 미묘해서 한 곳만 고치면 화면마다
 * 다른 숫자가 나온다. 규칙은 보유 휴가 화면과 같다.
 *
 *  - 주기 재원(정기외박)은 이월되지 않는다. 그래서 이번 주기 몫에 앞으로 받을
 *    몫(`upcomingAsOfTodayDays`)까지 더해야 "전역까지 쓸 수 있는 양"이 된다.
 *    다른 재원의 적립 예정분은 아직 확정이 아니라 더하지 않는다.
 *  - 남은 일수에서는 오늘까지 **다녀온** 몫만 뺀다. 아직 가지 않은 계획을 미리
 *    빼면 통장에 있는 휴가보다 적게 보인다 — 계획은 `planned`로 따로 알린다.
 *  - 그래서 주기 재원의 계획분은 `upcomingAsOfTodayDays - upcomingDays`, 즉
 *    "앞으로 받을 몫 중 미래 주기에 이미 잡아 둔 만큼"이다.
 */
import type { LeaveBalanceSummary } from "./types";

export type LeaveHoldings = {
  /** 오늘 기준으로 앞으로 쓸 수 있는 총 일수(계획으로 잡아 둔 몫 포함). */
  remaining: number;
  /** 그중 이미 계획으로 잡아 둔 일수. */
  planned: number;
  expiringSoon: number;
  expired: number;
};

export function summarizeHoldings(
  balances: LeaveBalanceSummary["balances"] | undefined,
): LeaveHoldings {
  return (balances ?? []).reduce<LeaveHoldings>(
    (sum, item) => ({
      remaining:
        sum.remaining +
        item.remainingAsOfTodayDays +
        (item.cycleScoped ? item.upcomingAsOfTodayDays : 0),
      planned:
        sum.planned +
        item.plannedDays +
        (item.cycleScoped ? item.upcomingAsOfTodayDays - item.upcomingDays : 0),
      expiringSoon: sum.expiringSoon + item.expiringSoonDays,
      expired: sum.expired + item.expiredDays,
    }),
    { remaining: 0, planned: 0, expiringSoon: 0, expired: 0 },
  );
}
