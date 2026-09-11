import { describe, expect, it } from "vitest";
import {
  allocateAllGrants,
  allocateBalanceGrants,
  grantStatus,
  isExpiringSoon,
  planTotalChange,
  sortGrantsForDisplay,
  type BalanceAllocation,
  type LeaveGrant,
  type SegmentLike,
} from "../src";

const TODAY = "2026-08-02";

function grant(over: Partial<LeaveGrant> & { id: string }): LeaveGrant {
  return {
    balanceKey: "award",
    days: 1,
    grantedOn: null,
    expiresOn: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** 하루짜리 사용 구간. 재원은 기본으로 포상휴가. */
function used(startDate: string, endDate = startDate): SegmentLike {
  return { category: "award", startDate, endDate };
}

/** 항등식 — 받은 일수는 반드시 어딘가로 간다. */
function expectBalanced(allocation: BalanceAllocation) {
  expect(
    allocation.usedDays -
      allocation.unattributedDays +
      allocation.remainingDays +
      allocation.expiredDays +
      allocation.upcomingDays,
  ).toBe(allocation.totalDays);
}

describe("적립분 배분", () => {
  it("만기가 없으면 잔여 = 총량 - 사용 (기존 동작과 같다)", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 5 })],
      [used("2026-07-01", "2026-07-02")],
      TODAY,
    );
    expect(result.totalDays).toBe(5);
    expect(result.usedDays).toBe(2);
    expect(result.remainingDays).toBe(3);
    expect(result.expiredDays).toBe(0);
    expect(result.unattributedDays).toBe(0);
    expectBalanced(result);
  });

  it("만기가 빠른 적립분부터 차감한다", () => {
    const result = allocateBalanceGrants(
      "award",
      [
        grant({ id: "later", days: 2 }), // 만기 없음
        grant({ id: "soon", days: 3, expiresOn: "2026-08-31" }),
      ],
      [used("2026-08-20", "2026-08-21")],
      TODAY,
    );
    const byId = new Map(result.grants.map((e) => [e.grant.id, e.usedDays]));
    expect(byId.get("soon")).toBe(2);
    expect(byId.get("later")).toBe(0);
    expect(result.remainingDays).toBe(3);
    expectBalanced(result);
  });

  it("만기가 지난 뒤 쓰면 만기 없는 적립분에서 빠지고 만기분은 소멸한다", () => {
    const result = allocateBalanceGrants(
      "award",
      [
        grant({ id: "expired", days: 3, expiresOn: "2026-08-31" }),
        grant({ id: "open", days: 2 }),
      ],
      [used("2026-09-05", "2026-09-06")],
      "2026-09-10",
    );
    const byId = new Map(result.grants.map((e) => [e.grant.id, e.usedDays]));
    expect(byId.get("expired")).toBe(0);
    expect(byId.get("open")).toBe(2);
    expect(result.expiredDays).toBe(3);
    expect(result.remainingDays).toBe(0);
    expect(result.unattributedDays).toBe(0);
    expectBalanced(result);
  });

  it("만기 임박분부터 쓰면 둘 다 살릴 수 있다 (EDF 최적성)", () => {
    // 만기 늦은 것부터 쓰는 순진한 규칙이면 8/30에 9/30분을 써버려 9/29가 미귀속이 된다.
    const result = allocateBalanceGrants(
      "award",
      [
        grant({ id: "aug", days: 2, expiresOn: "2026-08-31" }),
        grant({ id: "sep", days: 2, expiresOn: "2026-09-30" }),
      ],
      [used("2026-08-30", "2026-08-31"), used("2026-09-28", "2026-09-29")],
      "2026-10-01",
    );
    expect(result.unattributedDays).toBe(0);
    const byId = new Map(result.grants.map((e) => [e.grant.id, e.usedDays]));
    expect(byId.get("aug")).toBe(2);
    expect(byId.get("sep")).toBe(2);
    expectBalanced(result);
  });

  it("채울 적립분이 없으면 미귀속으로 남는다", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 1 })],
      [used("2026-07-01", "2026-07-03")],
      TODAY,
    );
    expect(result.unattributedDays).toBe(2);
    expect(result.unattributedDates).toEqual(["2026-07-02", "2026-07-03"]);
    expectBalanced(result);
  });

  it("만기가 지나기 전 쓴 날은 그 적립분에서 정상적으로 빠진다", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 3, expiresOn: "2026-07-31" })],
      [used("2026-07-30", "2026-07-31")],
      TODAY,
    );
    expect(result.grants[0]!.usedDays).toBe(2);
    // 남은 1일은 이미 만기가 지나 소멸했다.
    expect(result.expiredDays).toBe(1);
    expect(result.remainingDays).toBe(0);
    expectBalanced(result);
  });

  it("부여일이 미래면 예정 일수로 빠지고 잔여에 들어가지 않는다", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 4, grantedOn: "2026-09-01" })],
      [],
      TODAY,
    );
    expect(result.upcomingDays).toBe(4);
    expect(result.remainingDays).toBe(0);
    expect(result.totalDays).toBe(4);
    expectBalanced(result);
  });

  it("부여일 이전 날짜 사용은 그 적립분에서 빠지지 않는다", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 4, grantedOn: "2026-07-01" })],
      [used("2026-06-30")],
      TODAY,
    );
    expect(result.grants[0]!.usedDays).toBe(0);
    expect(result.unattributedDays).toBe(1);
    expectBalanced(result);
  });

  it("부여일이 null이면 시작 제한 없이 늘 유효하다 (마이그레이션 행 시맨틱)", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 4 })],
      [used("2020-01-01")],
      TODAY,
    );
    expect(result.grants[0]!.usedDays).toBe(1);
    expect(result.unattributedDays).toBe(0);
  });

  it("다른 재원의 사용분은 섞이지 않는다", () => {
    const all = allocateAllGrants(
      [
        grant({ id: "award", balanceKey: "award", days: 3 }),
        grant({ id: "annual", balanceKey: "annual", days: 3 }),
      ],
      [
        used("2026-07-01"),
        { category: "annual", startDate: "2026-07-05", endDate: "2026-07-06" },
      ],
      TODAY,
    );
    expect(all.award.usedDays).toBe(1);
    expect(all.annual.usedDays).toBe(2);
    expect(all.sick.totalDays).toBe(0);
  });

  it("정기외박 구간은 외박 종류로 재원을 가른다", () => {
    const all = allocateAllGrants(
      [grant({ id: "g", balanceKey: "other_overnight", days: 3 })],
      [
        {
          category: "overnight",
          overnightKind: "other",
          startDate: "2026-07-01",
          endDate: "2026-07-01",
        },
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: "2026-07-05",
          endDate: "2026-07-05",
        },
      ],
      TODAY,
    );
    expect(all.other_overnight.usedDays).toBe(1);
    expect(all.regular_overnight.usedDays).toBe(1);
    expect(all.regular_overnight.unattributedDays).toBe(1);
  });

  it("같은 입력은 늘 같은 배분을 낸다 (동점 처리가 결정적)", () => {
    const grants = [
      grant({ id: "b", days: 1, expiresOn: "2026-09-30" }),
      grant({ id: "a", days: 1, expiresOn: "2026-09-30" }),
    ];
    const first = allocateBalanceGrants(
      "award",
      grants,
      [used("2026-08-01")],
      TODAY,
    );
    const second = allocateBalanceGrants(
      "award",
      [...grants].reverse(),
      [used("2026-08-01")],
      TODAY,
    );
    expect(first.grants.map((e) => [e.grant.id, e.usedDays])).toEqual(
      second.grants.map((e) => [e.grant.id, e.usedDays]),
    );
    // id가 앞서는 쪽이 먼저 쓰인다.
    expect(first.grants[0]!.grant.id).toBe("a");
    expect(first.grants[0]!.usedDays).toBe(1);
  });
});

describe("만기·부여일 경계", () => {
  it("만기 당일은 아직 쓸 수 있고, 다음날은 못 쓴다", () => {
    const onTime = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 1, expiresOn: "2026-08-31" })],
      [used("2026-08-31")],
      "2026-09-01",
    );
    expect(onTime.grants[0]!.usedDays).toBe(1);
    expect(onTime.unattributedDays).toBe(0);

    const tooLate = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 1, expiresOn: "2026-08-31" })],
      [used("2026-09-01")],
      "2026-09-02",
    );
    expect(tooLate.unattributedDays).toBe(1);
    expect(tooLate.expiredDays).toBe(1);
  });

  it("부여일 당일부터 쓸 수 있다", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 1, grantedOn: "2026-08-01" })],
      [used("2026-08-01")],
      "2026-08-10",
    );
    expect(result.grants[0]!.usedDays).toBe(1);
  });

  it("한 구간이 만기를 걸치면 만기 전 날만 그 적립분에서 빠진다", () => {
    const result = allocateBalanceGrants(
      "award",
      [
        grant({ id: "dated", days: 5, expiresOn: "2026-08-31" }),
        grant({ id: "open", days: 5 }),
      ],
      [used("2026-08-30", "2026-09-02")],
      "2026-09-10",
    );
    const byId = new Map(result.grants.map((e) => [e.grant.id, e.usedDays]));
    expect(byId.get("dated")).toBe(2); // 8/30, 8/31
    expect(byId.get("open")).toBe(2); // 9/1, 9/2
    expect(result.unattributedDays).toBe(0);
    expectBalanced(result);
  });

  it("적립분이 아예 없으면 모든 사용이 미귀속으로 남는다", () => {
    const result = allocateBalanceGrants(
      "award",
      [],
      [used("2026-08-01", "2026-08-03")],
      "2026-08-10",
    );
    expect(result.totalDays).toBe(0);
    expect(result.usedDays).toBe(3);
    expect(result.unattributedDays).toBe(3);
    expect(result.remainingDays).toBe(0);
    expectBalanced(result);
  });
});

describe("오늘 기준 잔여 (미래 계획은 아직 쓴 것이 아니다)", () => {
  it("전체 107일 · 사용 13일 · 계획 12일이면 오늘 기준 잔여는 94일", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 107 })],
      [used("2026-07-01", "2026-07-13"), used("2026-09-01", "2026-09-12")],
      TODAY,
    );
    expect(result.totalDays).toBe(107);
    expect(result.usedToDateDays).toBe(13);
    expect(result.plannedDays).toBe(12);
    // 오늘까지 쓴 13일만 뺀다.
    expect(result.remainingAsOfTodayDays).toBe(94);
    // 계획까지 미리 뺀 값은 그대로 남아 새 휴가 검증에 쓰인다.
    expect(result.usedDays).toBe(25);
    expect(result.remainingDays).toBe(82);
    expectBalanced(result);
  });

  it("오늘을 걸친 구간은 오늘까지만 쓴 것으로 센다", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 10 })],
      [used("2026-08-01", "2026-08-05")],
      TODAY, // 2026-08-02 — 오늘은 이미 나가 있는 날이므로 사용에 넣는다.
    );
    expect(result.usedToDateDays).toBe(2);
    expect(result.plannedDays).toBe(3);
    expect(result.remainingAsOfTodayDays).toBe(8);
    expect(result.remainingDays).toBe(5);
  });

  it("계획이 없으면 두 잔여가 같다", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "a", days: 10 })],
      [used("2026-07-01", "2026-07-04")],
      TODAY,
    );
    expect(result.plannedDays).toBe(0);
    expect(result.remainingAsOfTodayDays).toBe(result.remainingDays);
  });

  it("적립분별 사용도 오늘까지와 계획을 나눠 센다", () => {
    const result = allocateBalanceGrants(
      "award",
      [
        grant({ id: "soon", days: 3, expiresOn: "2026-12-31" }),
        grant({ id: "never", days: 5 }),
      ],
      // 만기 임박분(soon)이 먼저 소진되고, 남는 날짜가 never로 넘어간다.
      [used("2026-07-01", "2026-07-02"), used("2026-09-01", "2026-09-03")],
      TODAY,
    );
    const byId = new Map(
      result.grants.map((e) => [e.grant.id, e.usedToDateDays]),
    );
    expect(byId.get("soon")).toBe(2);
    expect(byId.get("never")).toBe(0);
    expect(result.usedToDateDays).toBe(2);
    expect(result.plannedDays).toBe(3);
    expect(result.remainingAsOfTodayDays).toBe(6);
    expect(result.remainingDays).toBe(3);
  });

  it("아직 부여되지 않은 적립분은 오늘 기준 잔여에 들어가지 않는다", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "later", days: 5, grantedOn: "2026-09-01" })],
      [used("2026-09-02", "2026-09-03")],
      TODAY,
    );
    // 부여 전이라 지금 쓸 수 있는 몫이 아니다 — 두 잔여 모두 0.
    expect(result.remainingAsOfTodayDays).toBe(0);
    expect(result.remainingDays).toBe(0);
    expect(result.upcomingDays).toBe(3);
    // 앞으로 받을 몫은 계획으로 줄지 않는다 — 아직 다녀오지 않았으므로 5일 그대로다.
    expect(result.upcomingAsOfTodayDays).toBe(5);
    expect(result.plannedDays).toBe(2);
  });

  it("예정 적립분에 계획이 없으면 두 예정분이 같다", () => {
    const result = allocateBalanceGrants(
      "award",
      [grant({ id: "later", days: 5, grantedOn: "2026-09-01" })],
      [],
      TODAY,
    );
    expect(result.upcomingDays).toBe(5);
    expect(result.upcomingAsOfTodayDays).toBe(5);
  });

  it("만료된 적립분에 달린 지난 사용은 오늘 기준 잔여를 늘리지 않는다", () => {
    const result = allocateBalanceGrants(
      "award",
      [
        grant({ id: "gone", days: 4, expiresOn: "2026-07-31" }),
        grant({ id: "live", days: 6 }),
      ],
      [used("2026-07-10", "2026-07-13")],
      TODAY,
    );
    expect(result.usedToDateDays).toBe(4);
    // 만료분에서 4일이 빠졌으므로 살아 있는 적립분 6일만 남는다.
    expect(result.remainingAsOfTodayDays).toBe(6);
    expect(result.remainingDays).toBe(6);
  });
});

describe("적립분 상태", () => {
  it("부여일 전이면 예정, 만기 후면 만료, 그 사이는 사용 가능", () => {
    expect(
      grantStatus(grant({ id: "a", grantedOn: "2026-09-01" }), TODAY),
    ).toBe("future");
    expect(
      grantStatus(grant({ id: "a", expiresOn: "2026-08-01" }), TODAY),
    ).toBe("expired");
    expect(
      grantStatus(grant({ id: "a", expiresOn: "2026-08-02" }), TODAY),
    ).toBe("active");
    expect(grantStatus(grant({ id: "a" }), TODAY)).toBe("active");
  });

  it("만기 임박은 아직 살아 있는 적립분만 해당한다", () => {
    expect(
      isExpiringSoon(grant({ id: "a", expiresOn: "2026-08-20" }), TODAY),
    ).toBe(true);
    expect(
      isExpiringSoon(grant({ id: "a", expiresOn: "2026-10-20" }), TODAY),
    ).toBe(false);
    expect(
      isExpiringSoon(grant({ id: "a", expiresOn: "2026-07-20" }), TODAY),
    ).toBe(false);
    expect(isExpiringSoon(grant({ id: "a" }), TODAY)).toBe(false);
  });

  it("표시 순서는 만기 빠른 순, 만기 없는 건 맨 뒤", () => {
    const sorted = sortGrantsForDisplay([
      grant({ id: "none" }),
      grant({ id: "late", expiresOn: "2026-12-31" }),
      grant({ id: "soon", expiresOn: "2026-08-31" }),
    ]);
    expect(sorted.map((g) => g.id)).toEqual(["soon", "late", "none"]);
  });
});

describe("구버전 총량 API 매핑", () => {
  const allocate = (grants: LeaveGrant[], usages: SegmentLike[] = []) =>
    allocateBalanceGrants("award", grants, usages, TODAY);

  it("늘리면 만기 없는 기본 적립분에 더한다", () => {
    const plan = planTotalChange(
      allocate([
        grant({ id: "base", days: 4 }),
        grant({ id: "dated", days: 3, expiresOn: "2026-08-31" }),
      ]),
      12,
    );
    expect(plan).toEqual({
      ok: true,
      mutations: [{ kind: "update", id: "base", days: 9 }],
    });
  });

  it("기본 적립분이 없으면 만기 없는 건을 새로 만든다", () => {
    const plan = planTotalChange(
      allocate([grant({ id: "dated", days: 3, expiresOn: "2026-08-31" })]),
      5,
    );
    expect(plan).toEqual({
      ok: true,
      mutations: [{ kind: "create", balanceKey: "award", days: 2 }],
    });
  });

  it("줄이면 기본 적립분부터, 그다음 만기가 늦은 것부터 흡수한다", () => {
    const plan = planTotalChange(
      allocate([
        grant({ id: "base", days: 2 }),
        grant({ id: "late", days: 2, expiresOn: "2026-12-31" }),
        grant({ id: "soon", days: 2, expiresOn: "2026-08-31" }),
      ]),
      1,
    );
    expect(plan).toEqual({
      ok: true,
      mutations: [
        { kind: "delete", id: "base" },
        { kind: "delete", id: "late" },
        { kind: "update", id: "soon", days: 1 },
      ],
    });
  });

  it("어떤 적립분도 자기 사용분 아래로 내려가지 않는다", () => {
    // soon 2일을 모두 썼으므로 총 3일로 줄이면 base만 1일 깎인다.
    const plan = planTotalChange(
      allocate(
        [
          grant({ id: "base", days: 2 }),
          grant({ id: "soon", days: 2, expiresOn: "2026-08-31" }),
        ],
        [used("2026-08-01", "2026-08-02")],
      ),
      3,
    );
    expect(plan).toEqual({
      ok: true,
      mutations: [{ kind: "update", id: "base", days: 1 }],
    });
  });

  it("이미 쓴 일수보다 작게 설정하면 거절한다", () => {
    const plan = planTotalChange(
      allocate(
        [grant({ id: "base", days: 5 })],
        [used("2026-08-01", "2026-08-03")],
      ),
      2,
    );
    expect(plan).toEqual({ ok: false, minimumTotal: 3 });
  });

  it("총량이 그대로면 아무것도 바꾸지 않는다", () => {
    expect(
      planTotalChange(allocate([grant({ id: "base", days: 5 })]), 5),
    ).toEqual({
      ok: true,
      mutations: [],
    });
  });

  it("0으로 만들면 적립분이 남지 않는다", () => {
    expect(
      planTotalChange(allocate([grant({ id: "base", days: 3 })]), 0),
    ).toEqual({
      ok: true,
      mutations: [{ kind: "delete", id: "base" }],
    });
  });
});

/**
 * 상태가 다른 두 휴가는 같은 날짜에 겹칠 수 있다 — 초안으로 시뮬레이션한 뒤 실제
 * 휴가를 만드는 흐름이 그렇다(leave-merge의 겹침 검사는 같은 상태끼리만 본다).
 * 하루에 두 번 나갈 수는 없으므로 그 날짜를 두 번 세면 안 된다.
 */
describe("겹치는 구간의 날짜는 한 번만 센다", () => {
  it("같은 기간을 덮는 구간이 둘이면 5일 여행에서 5일만 빠진다", () => {
    const allocation = allocateBalanceGrants(
      "award",
      [grant({ id: "base", days: 10 })],
      [used("2026-08-01", "2026-08-05"), used("2026-08-01", "2026-08-05")],
      TODAY,
    );
    expect(allocation.usedDays).toBe(5);
    expect(allocation.remainingDays).toBe(5);
    expect(allocation.unattributedDays).toBe(0);
    expectBalanced(allocation);
  });

  it("일부만 겹쳐도 합집합만 센다", () => {
    const allocation = allocateBalanceGrants(
      "award",
      [grant({ id: "base", days: 10 })],
      [used("2026-08-01", "2026-08-03"), used("2026-08-03", "2026-08-05")],
      TODAY,
    );
    expect(allocation.usedDays).toBe(5);
    expect(allocation.remainingDays).toBe(5);
  });

  it("겹치지 않으면 예전과 같이 더한다", () => {
    const allocation = allocateBalanceGrants(
      "award",
      [grant({ id: "base", days: 10 })],
      [used("2026-08-01", "2026-08-02"), used("2026-08-04", "2026-08-05")],
      TODAY,
    );
    expect(allocation.usedDays).toBe(4);
  });

  it("재원이 다르면 같은 날짜라도 각자 센다", () => {
    const result = allocateAllGrants(
      [
        grant({ id: "a", days: 5 }),
        grant({ id: "b", balanceKey: "annual", days: 5 }),
      ],
      [
        used("2026-08-01", "2026-08-02"),
        { category: "annual", startDate: "2026-08-01", endDate: "2026-08-02" },
      ],
      TODAY,
    );
    expect(result.award.usedDays).toBe(2);
    expect(result.annual.usedDays).toBe(2);
  });
});
