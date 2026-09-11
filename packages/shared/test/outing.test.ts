import { describe, expect, it } from "vitest";
import {
  checkOuting,
  isOutingBalanceKey,
  isOutingCycleBased,
  outingAvailableIn,
  outingBalanceKey,
  outingBlockMessage,
  outingCycleFor,
  outingCycleForDisplay,
  outingCycleStartsInRange,
  outingCyclesInRange,
  outingKindOfBalanceKey,
  outingPooledRemaining,
  outingRemainingDays,
  outingUsageByCycle,
  outingUsedDays,
  segmentBalanceKey,
  type OutingConfig,
  type SegmentLike,
} from "../src";

/** 평일 외출 — 입대월 1일부터 한 달 주기, 회당 2회. 첫 적립은 2026-04-01. */
const weekday: OutingConfig = {
  enabled: true,
  startDate: "2026-03-01",
  intervalDays: null,
  intervalMonths: 1,
  daysPerGrant: 2,
};

/** 주말 외출 — 같은 주기, 회당 1회. */
const weekend: OutingConfig = { ...weekday, daysPerGrant: 1 };

const DISCHARGE = "2027-08-31";

function outing(date: string, kind: "weekday" | "weekend"): SegmentLike {
  return {
    category: "outing",
    outingKind: kind,
    startDate: date,
    endDate: date,
  };
}

describe("외출 재원과 갈래", () => {
  it("갈래가 재원을 가른다", () => {
    expect(outingBalanceKey("weekday")).toBe("outing");
    expect(outingBalanceKey("weekend")).toBe("weekend_outing");
    expect(outingKindOfBalanceKey("outing")).toBe("weekday");
    expect(outingKindOfBalanceKey("weekend_outing")).toBe("weekend");
    expect(outingKindOfBalanceKey("annual")).toBe(null);
    expect(isOutingBalanceKey("outing")).toBe(true);
    expect(isOutingBalanceKey("regular_overnight")).toBe(false);
  });

  it("갈래가 비어 있는 옛 구간은 평일로 읽는다", () => {
    expect(segmentBalanceKey({ category: "outing" })).toBe("outing");
    expect(
      segmentBalanceKey({ category: "outing", outingKind: "weekday" }),
    ).toBe("outing");
    expect(
      segmentBalanceKey({ category: "outing", outingKind: "weekend" }),
    ).toBe("weekend_outing");
  });
});

describe("외출 주기", () => {
  it("설정이 꺼져 있으면 주기가 없다", () => {
    expect(isOutingCycleBased(null)).toBe(false);
    expect(isOutingCycleBased({ ...weekday, enabled: false })).toBe(false);
    expect(isOutingCycleBased(weekday)).toBe(true);
    expect(outingCycleFor(null, "2026-05-01")).toBe(null);
  });

  it("첫 적립은 한 주기 뒤 — 입대월에는 아직 외출이 없다", () => {
    expect(outingCycleFor(weekday, "2026-03-15")).toBe(null);
    expect(outingCycleFor(weekday, "2026-04-01")).toMatchObject({
      index: 1,
      start: "2026-04-01",
      end: "2026-04-30",
      grantDays: 2,
    });
  });

  it("전역일 다음 날부터는 표시용 주기를 돌려주지 않는다", () => {
    expect(outingCycleForDisplay(weekday, DISCHARGE, DISCHARGE)).toMatchObject({
      start: "2027-08-01",
    });
    expect(outingCycleForDisplay(weekday, "2027-09-01", DISCHARGE)).toBe(null);
  });
});

describe("주기 시작일 마커", () => {
  it("범위 안에서 시작하는 주기만 준다 — 넘어온 주기는 마커가 아니다", () => {
    // 4/15~5/15에는 4주기(4/1 시작)가 겹치지만 시작일은 범위 밖이다.
    expect(
      outingCyclesInRange(weekday, "2026-04-15", "2026-05-15").map(
        (cycle) => cycle.start,
      ),
    ).toEqual(["2026-04-01", "2026-05-01"]);
    expect(
      outingCycleStartsInRange(weekday, "2026-04-15", "2026-05-15").map(
        (cycle) => cycle.start,
      ),
    ).toEqual(["2026-05-01"]);
  });

  it("한 달을 통째로 물으면 그 달에 열리는 주기가 나온다", () => {
    const starts = outingCycleStartsInRange(
      weekday,
      "2026-06-01",
      "2026-06-30",
    );
    expect(starts).toEqual([
      { index: 3, start: "2026-06-01", end: "2026-06-30", grantDays: 2 },
    ]);
  });

  it("적립일이 전역일 뒤인 주기는 마커도 찍지 않는다", () => {
    expect(
      outingCycleStartsInRange(weekday, "2027-09-01", "2027-09-30", DISCHARGE),
    ).toEqual([]);
    // 전역일이 낀 달의 주기는 남는다.
    expect(
      outingCycleStartsInRange(
        weekday,
        "2027-08-01",
        "2027-08-31",
        DISCHARGE,
      ).map((cycle) => cycle.start),
    ).toEqual(["2027-08-01"]);
  });

  it("첫 적립 전 달에는 마커가 없다", () => {
    expect(
      outingCycleStartsInRange(weekday, "2026-03-01", "2026-03-31"),
    ).toEqual([]);
  });
});

describe("주기별 사용량", () => {
  const cycle = outingCycleFor(weekday, "2026-04-10")!;

  it("그 주기에 든 같은 갈래만 센다", () => {
    const segments = [
      outing("2026-04-05", "weekday"),
      outing("2026-04-20", "weekend"), // 다른 갈래
      outing("2026-05-05", "weekday"), // 다음 주기
    ];
    expect(outingUsedDays("weekday", cycle, segments)).toBe(1);
    expect(outingUsedDays("weekend", cycle, segments)).toBe(1);
    expect(outingRemainingDays("weekday", cycle, segments)).toBe(1);
  });

  it("같은 날짜가 두 번 오면 한 번만 센다 — 초안과 실제가 겹칠 수 있다", () => {
    const segments = [
      outing("2026-04-05", "weekday"),
      outing("2026-04-05", "weekday"),
    ];
    expect(outingUsedDays("weekday", cycle, segments)).toBe(1);
  });

  it("갈래가 생기기 전의 여러 날짜짜리 외출도 겹치는 날만 센다", () => {
    const legacy: SegmentLike = {
      category: "outing",
      startDate: "2026-03-30",
      endDate: "2026-04-02",
    };
    // 3/30·3/31은 첫 적립 전이라 주기 밖, 4/1·4/2만 1주기에 든다.
    expect(outingUsedDays("weekday", cycle, [legacy])).toBe(2);
  });

  it("주기별로 묶으면 첫 적립 전에 쓴 날이 따로 남는다", () => {
    const segments = [
      outing("2026-03-10", "weekday"), // 첫 적립 전
      outing("2026-04-05", "weekday"),
      outing("2026-05-05", "weekday"),
    ];
    const usage = outingUsageByCycle("weekday", weekday, segments);
    expect(usage.beforeFirstGrantDays).toBe(1);
    expect(usage.cycles.map((entry) => entry.usedDays)).toEqual([1, 1]);
  });

  it("설정이 없으면 전부 첫 적립 전으로 센다", () => {
    const usage = outingUsageByCycle("weekday", null, [
      outing("2026-04-05", "weekday"),
    ]);
    expect(usage).toEqual({ cycles: [], beforeFirstGrantDays: 1 });
  });
});

describe("사용 가능 여부", () => {
  it("주기 몫 안이면 통과한다", () => {
    expect(
      checkOuting({
        kind: "weekday",
        config: weekday,
        existing: [],
        requested: [outing("2026-04-05", "weekday")],
        dischargeAt: DISCHARGE,
      }),
    ).toBe(null);
  });

  it("주기 몫을 넘기면 막는다 — 이미 저장된 것까지 더해서 센다", () => {
    const block = checkOuting({
      kind: "weekday",
      config: weekday,
      existing: [
        outing("2026-04-05", "weekday"),
        outing("2026-04-06", "weekday"),
      ],
      requested: [outing("2026-04-07", "weekday")],
      dischargeAt: DISCHARGE,
    });
    expect(block).toMatchObject({ kind: "over_cycle", usedDays: 3 });
    expect(outingBlockMessage("weekday", block!)).toBe(
      "평일 외출 1주기(4/1–4/30) 몫 2회를 1회 초과했어요",
    );
  });

  it("갈래가 다르면 서로의 몫을 깎지 않는다", () => {
    expect(
      checkOuting({
        kind: "weekend",
        config: weekend,
        existing: [
          outing("2026-04-05", "weekday"),
          outing("2026-04-06", "weekday"),
        ],
        requested: [outing("2026-04-07", "weekend")],
        dischargeAt: DISCHARGE,
      }),
    ).toBe(null);
  });

  it("주말 외출은 회당 1회라 같은 달 두 번째부터 막힌다", () => {
    const block = checkOuting({
      kind: "weekend",
      config: weekend,
      existing: [outing("2026-04-04", "weekend")],
      requested: [outing("2026-04-11", "weekend")],
      dischargeAt: DISCHARGE,
    });
    expect(block).toMatchObject({ kind: "over_cycle" });
    expect(outingBlockMessage("weekend", block!)).toContain("주말 외출 1주기");
  });

  it("첫 적립 전에는 쓸 수 없다", () => {
    const block = checkOuting({
      kind: "weekday",
      config: weekday,
      existing: [],
      requested: [outing("2026-03-20", "weekday")],
      dischargeAt: DISCHARGE,
    });
    expect(block).toEqual({
      kind: "before_first_grant",
      firstGrantDate: "2026-04-01",
    });
    expect(outingBlockMessage("weekday", block!)).toBe(
      "평일 외출은 첫 적립일(4월 1일) 이후부터 사용할 수 있습니다",
    );
  });

  it("적립일이 전역일 뒤인 주기는 받지 못한다", () => {
    const block = checkOuting({
      kind: "weekday",
      config: weekday,
      existing: [],
      requested: [outing("2027-09-10", "weekday")],
      dischargeAt: DISCHARGE,
    });
    expect(block).toMatchObject({ kind: "after_discharge" });
    expect(outingBlockMessage("weekday", block!)).toContain("전역일 뒤라");
  });

  it("자동 적립을 안 쓰면 여기서 막지 않는다 — 적립분으로 따지는 몫이다", () => {
    expect(
      checkOuting({
        kind: "weekday",
        config: null,
        existing: [],
        requested: [outing("2026-04-05", "weekday")],
        dischargeAt: DISCHARGE,
      }),
    ).toBe(null);
  });

  it("외출이 아닌 구간만 오면 볼 것이 없다", () => {
    expect(
      checkOuting({
        kind: "weekday",
        config: weekday,
        existing: [],
        requested: [
          {
            category: "annual",
            startDate: "2026-04-05",
            endDate: "2026-04-07",
          },
        ],
        dischargeAt: DISCHARGE,
      }),
    ).toBe(null);
  });
});

describe("이월", () => {
  const pooled: OutingConfig = { ...weekday, carryOver: true };

  it("앞선 주기에서 남긴 몫을 다음 주기가 당겨 쓸 수 있다", () => {
    // 1주기(4월)를 하나도 안 썼으므로 2주기(5월)에 최대 4회까지 된다.
    expect(
      checkOuting({
        kind: "weekday",
        config: pooled,
        existing: [
          outing("2026-05-01", "weekday"),
          outing("2026-05-02", "weekday"),
          outing("2026-05-03", "weekday"),
        ],
        requested: [outing("2026-05-04", "weekday")],
        dischargeAt: DISCHARGE,
      }),
    ).toBe(null);
  });

  it("쌓인 몫까지 넘기면 막는다", () => {
    const block = checkOuting({
      kind: "weekday",
      config: pooled,
      existing: [
        outing("2026-05-01", "weekday"),
        outing("2026-05-02", "weekday"),
        outing("2026-05-03", "weekday"),
        outing("2026-05-04", "weekday"),
      ],
      requested: [outing("2026-05-05", "weekday")],
      dischargeAt: DISCHARGE,
    });
    expect(block).toMatchObject({
      kind: "over_pool",
      grantedDays: 4,
      usedDays: 5,
    });
    expect(outingBlockMessage("weekday", block!)).toContain(
      "쌓이는 평일 외출 4회",
    );
  });

  it("누적 잔여는 첫 적립일부터 기준일까지 쌓인 몫에서 쓴 것을 뺀 값이다", () => {
    expect(
      outingPooledRemaining({
        kind: "weekday",
        config: pooled,
        used: [outing("2026-04-05", "weekday")],
        dischargeAt: DISCHARGE,
        on: "2026-06-15",
      }),
    ).toBe(5); // 3주기 × 2회 − 1회
  });

  it("이월이 꺼져 있어도 함수 자체는 주기별 잔여의 합을 낸다", () => {
    expect(
      outingPooledRemaining({
        kind: "weekday",
        config: null,
        used: [],
        dischargeAt: DISCHARGE,
        on: "2026-06-15",
      }),
    ).toBe(0);
  });
});

describe("폼 칩에 쓰는 잔여", () => {
  it("그 날짜가 속한 주기의 남은 횟수를 낸다", () => {
    expect(
      outingAvailableIn({
        kind: "weekday",
        config: weekday,
        used: [outing("2026-04-05", "weekday")],
        dischargeAt: DISCHARGE,
        from: "2026-04-10",
        to: "2026-04-10",
      }),
    ).toBe(1);
  });

  it("초과분은 음수로 그대로 낸다 — 칩과 판정이 같은 순간에 막혀야 한다", () => {
    expect(
      outingAvailableIn({
        kind: "weekday",
        config: weekday,
        used: [
          outing("2026-04-05", "weekday"),
          outing("2026-04-06", "weekday"),
          outing("2026-04-07", "weekday"),
        ],
        dischargeAt: DISCHARGE,
        from: "2026-04-10",
        to: "2026-04-10",
      }),
    ).toBe(-1);
  });

  it("첫 적립 전이거나 설정이 없으면 0", () => {
    expect(
      outingAvailableIn({
        kind: "weekday",
        config: weekday,
        used: [],
        dischargeAt: DISCHARGE,
        from: "2026-03-20",
        to: "2026-03-20",
      }),
    ).toBe(0);
    expect(
      outingAvailableIn({
        kind: "weekday",
        config: null,
        used: [],
        dischargeAt: DISCHARGE,
        from: "2026-04-10",
        to: "2026-04-10",
      }),
    ).toBe(0);
  });

  it("적립일이 전역 뒤인 주기가 끼면 0", () => {
    expect(
      outingAvailableIn({
        kind: "weekday",
        config: weekday,
        used: [],
        dischargeAt: DISCHARGE,
        from: "2027-09-10",
        to: "2027-09-10",
      }),
    ).toBe(0);
  });
});
