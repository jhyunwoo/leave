import { describe, expect, it } from "vitest";
import {
  activeLeaveCycleConfig,
  buildCycle,
  cycleDateAfter,
  cycleFor,
  cyclesInRange,
  firstGrantDate,
  grantDatesThrough,
  grantedThroughCycle,
  leaveCycleCount,
  leaveCycleInterval,
  MAX_LEAVE_CYCLES,
  nextGrantDateAfter,
  usedThroughCycle,
  type LeaveCycleConfig,
} from "../src";

/** 달 단위 주기 — 육군 분기(3개월)와 외출의 월 1회가 쓰는 쪽. */
const monthly: LeaveCycleConfig = {
  enabled: true,
  startDate: "2026-03-01",
  intervalDays: null,
  intervalMonths: 1,
  daysPerGrant: 2,
};

/** 일 단위 주기 — 해·공군 정기외박의 42일. */
const daily: LeaveCycleConfig = {
  enabled: true,
  startDate: "2026-03-30",
  intervalDays: 42,
  daysPerGrant: 4,
};

describe("주기 설정 해석", () => {
  it("달 단위가 일 단위보다 먼저다 — 군종을 바꾸다 두 값이 섞여도 규정에 가까운 쪽으로 정해진다", () => {
    expect(
      leaveCycleInterval({ ...monthly, intervalDays: 42, intervalMonths: 3 }),
    ).toEqual({ unit: "month", value: 3 });
    expect(leaveCycleInterval(daily)).toEqual({ unit: "day", value: 42 });
  });

  it("값이 하나라도 비면 주기를 만들 수 없다", () => {
    expect(activeLeaveCycleConfig({ ...monthly, enabled: false })).toBe(null);
    expect(activeLeaveCycleConfig({ ...monthly, startDate: null })).toBe(null);
    expect(activeLeaveCycleConfig({ ...monthly, daysPerGrant: null })).toBe(
      null,
    );
    expect(
      activeLeaveCycleConfig({
        ...monthly,
        intervalDays: null,
        intervalMonths: null,
      }),
    ).toBe(null);
    expect(activeLeaveCycleConfig(null)).toBe(null);
    expect(leaveCycleInterval(undefined)).toBe(null);
  });
});

describe("달 단위 주기의 말일", () => {
  it("주기를 이어 붙이지 않고 시작일에서 한 번에 더한다 — 말일이 끌려가면 안 된다", () => {
    // 1/31에서 3개월씩 두 번 이어 붙이면 4/30 → 7/30이지만, 6개월을 한 번에 더하면 7/31이다.
    const quarterly: LeaveCycleConfig = {
      enabled: true,
      startDate: "2026-01-31",
      intervalDays: null,
      intervalMonths: 3,
      daysPerGrant: 2,
    };
    expect(cycleDateAfter(quarterly, 1)).toBe("2026-04-30");
    expect(cycleDateAfter(quarterly, 2)).toBe("2026-07-31");
    expect(cycleDateAfter(quarterly, 4)).toBe("2027-01-31");
  });

  it("짧은 달로 떨어지면 그 달 말일로 접힌다", () => {
    const config: LeaveCycleConfig = {
      enabled: true,
      startDate: "2025-12-31",
      intervalDays: null,
      intervalMonths: 2,
      daysPerGrant: 1,
    };
    expect(cycleDateAfter(config, 1)).toBe("2026-02-28");
  });
});

describe("첫 적립과 주기 순번", () => {
  it("첫 적립일은 주기 시작일이 아니라 한 주기 뒤다", () => {
    expect(firstGrantDate(monthly)).toBe("2026-04-01");
    expect(firstGrantDate(daily)).toBe("2026-05-11");
  });

  it("주기 시작일부터 첫 적립 전날까지는 어떤 주기에도 속하지 않는다", () => {
    expect(cycleFor(monthly, "2026-03-01")).toBe(null);
    expect(cycleFor(monthly, "2026-03-31")).toBe(null);
    expect(cyclesInRange(monthly, "2026-03-01", "2026-03-31")).toEqual([]);
  });

  it("1주기는 첫 적립일에 시작하고 다음 적립 전날에 끝난다", () => {
    expect(cycleFor(monthly, "2026-04-01")).toEqual({
      index: 1,
      start: "2026-04-01",
      end: "2026-04-30",
      grantDays: 2,
    });
    expect(cycleFor(monthly, "2026-04-30")).toMatchObject({ index: 1 });
    expect(cycleFor(monthly, "2026-05-01")).toMatchObject({ index: 2 });
  });

  it("연말을 넘어가도 순번이 이어진다", () => {
    expect(cycleFor(monthly, "2026-12-01")).toMatchObject({
      index: 9,
      start: "2026-12-01",
      end: "2026-12-31",
    });
    expect(cycleFor(monthly, "2027-01-01")).toMatchObject({
      index: 10,
      start: "2027-01-01",
      end: "2027-01-31",
    });
  });
});

describe("범위 조회", () => {
  it("범위와 하루라도 겹치면 들어온다 — 지난달에 시작해 넘어온 주기도", () => {
    const cycles = cyclesInRange(daily, "2026-06-01", "2026-06-30");
    expect(cycles.map((cycle) => cycle.index)).toEqual([1, 2]);
    expect(cycles[0]).toMatchObject({ start: "2026-05-11", end: "2026-06-21" });
  });

  it("범위가 뒤집혀 있으면 빈 배열", () => {
    expect(cyclesInRange(monthly, "2026-06-30", "2026-06-01")).toEqual([]);
  });

  it("첫 적립 앞은 잘라낸다", () => {
    expect(cyclesInRange(monthly, "2020-01-01", "2026-04-01")).toEqual([
      { index: 1, start: "2026-04-01", end: "2026-04-30", grantDays: 2 },
    ]);
  });

  it("아무리 넓은 범위를 물어도 상한을 넘겨 만들지 않는다", () => {
    const cycles = cyclesInRange(monthly, "2026-04-01", "3000-01-01");
    expect(cycles).toHaveLength(MAX_LEAVE_CYCLES);
  });
});

describe("적립일 목록", () => {
  it("기준일까지 도래한 적립일만 돌려준다 — 기준일 당일 적립은 포함", () => {
    expect(grantDatesThrough(monthly, "2026-06-01")).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
    expect(grantDatesThrough(monthly, "2026-03-31")).toEqual([]);
    expect(grantDatesThrough(null, "2026-06-01")).toEqual([]);
  });

  it("다음 적립일은 기준일이 마침 적립일이어도 그 다음 주기다", () => {
    expect(nextGrantDateAfter(monthly, "2026-04-01")).toBe("2026-05-01");
    expect(nextGrantDateAfter(monthly, "2026-04-15")).toBe("2026-05-01");
    // 주기 시작일보다 이른 날을 물으면 첫 적립일로 접힌다.
    expect(nextGrantDateAfter(monthly, "2020-01-01")).toBe("2026-04-01");
  });
});

describe("주기 수 세기", () => {
  it("주기를 만들지 않고 세며, 첫 적립 전에는 0이다", () => {
    expect(leaveCycleCount(monthly, "2026-03-31")).toBe(0);
    expect(leaveCycleCount(monthly, "2026-04-01")).toBe(1);
    expect(leaveCycleCount(monthly, "2027-03-31")).toBe(12);
    expect(leaveCycleCount(null, "2027-03-31")).toBe(0);
  });

  it("상한 검사가 필요한 설정을 실제로 잡아낸다 — 1900년 + 1일 주기", () => {
    const runaway: LeaveCycleConfig = {
      enabled: true,
      startDate: "1900-01-01",
      intervalDays: 1,
      intervalMonths: null,
      daysPerGrant: 1,
    };
    expect(leaveCycleCount(runaway, "2026-09-11")).toBeGreaterThan(
      MAX_LEAVE_CYCLES,
    );
  });
});

describe("누적 셈의 재료", () => {
  it("k주기까지 받은 몫은 회당 × k다", () => {
    const active = activeLeaveCycleConfig(monthly)!;
    expect(grantedThroughCycle(active, 1)).toBe(2);
    expect(grantedThroughCycle(active, 5)).toBe(10);
  });

  it("사용량 합계는 1주기부터 k주기까지 주입받은 계산을 더한다", () => {
    const active = activeLeaveCycleConfig(monthly)!;
    // 주기마다 순번만큼 썼다고 하면 3주기까지의 합은 1+2+3.
    expect(usedThroughCycle(active, 3, (cycle) => cycle.index)).toBe(6);
    expect(usedThroughCycle(active, 0, () => 99)).toBe(0);
  });

  it("주기 하나를 순번으로 되짚을 수 있다", () => {
    const active = activeLeaveCycleConfig(daily)!;
    expect(buildCycle(active, 2)).toEqual({
      index: 2,
      start: "2026-06-22",
      end: "2026-08-02",
      grantDays: 4,
    });
  });
});
