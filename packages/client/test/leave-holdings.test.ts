/**
 * 재원별 잔여를 한 줄로 합치는 셈.
 *
 * 이 숫자는 내 휴가 화면의 큰 글씨(“남은 휴가 N일”)와 달력 요약 패널이 함께
 * 쓴다. 주기 재원(정기외박)은 이월되지 않아 앞으로 받을 몫까지 더해야 하고,
 * 계획은 잔여에서 빼지 않고 따로 세는 규칙이라, 한쪽만 틀려도 화면마다 다른
 * 숫자가 나온다.
 */

import { describe, expect, it } from "vitest";
import { summarizeHoldings } from "../src/leave-holdings";
import type { LeaveBalanceSummary } from "../src/types";

type Balance = LeaveBalanceSummary["balances"][number];

function balance(overrides: Partial<Balance>): Balance {
  return {
    key: "annual",
    label: "연가",
    cycleScoped: false,
    totalDays: 0,
    usedDays: 0,
    usedToDateDays: 0,
    plannedDays: 0,
    remainingDays: 0,
    remainingAsOfTodayDays: 0,
    upcomingDays: 0,
    upcomingAsOfTodayDays: 0,
    expiringSoonDays: 0,
    expiredDays: 0,
    ...overrides,
  } as Balance;
}

describe("summarizeHoldings", () => {
  it("재원이 없으면 모두 0이다", () => {
    expect(summarizeHoldings(undefined)).toEqual({
      remaining: 0,
      planned: 0,
      expiringSoon: 0,
      expired: 0,
    });
  });

  it("주기 밖 재원은 오늘 기준 잔여와 계획을 그대로 더한다", () => {
    const holdings = summarizeHoldings([
      balance({ remainingAsOfTodayDays: 10, plannedDays: 3 }),
      balance({ key: "award", remainingAsOfTodayDays: 4, plannedDays: 1 }),
    ]);
    expect(holdings.remaining).toBe(14);
    expect(holdings.planned).toBe(4);
  });

  it("주기 재원은 앞으로 받을 몫까지 잔여에 더한다", () => {
    const holdings = summarizeHoldings([
      balance({
        key: "regular_overnight",
        cycleScoped: true,
        remainingAsOfTodayDays: 2,
        upcomingAsOfTodayDays: 12,
        upcomingDays: 12,
      }),
    ]);
    expect(holdings.remaining).toBe(14);
    expect(holdings.planned).toBe(0);
  });

  it("미래 주기에 잡아 둔 계획은 잔여에 남기고 계획으로만 센다", () => {
    const holdings = summarizeHoldings([
      balance({
        key: "regular_overnight",
        cycleScoped: true,
        remainingAsOfTodayDays: 2,
        plannedDays: 1,
        // 앞으로 받을 12일 중 4일은 이미 미래 주기에 계획으로 잡혀 있다.
        upcomingAsOfTodayDays: 12,
        upcomingDays: 8,
      }),
    ]);
    expect(holdings.remaining).toBe(14);
    expect(holdings.planned).toBe(5);
  });

  it("만료 임박·소멸은 재원을 가리지 않고 합산한다", () => {
    const holdings = summarizeHoldings([
      balance({ expiringSoonDays: 2, expiredDays: 1 }),
      balance({ key: "award", expiringSoonDays: 3, expiredDays: 4 }),
    ]);
    expect(holdings.expiringSoon).toBe(5);
    expect(holdings.expired).toBe(5);
  });
});
