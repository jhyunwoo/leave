import { describe, expect, it } from "vitest";
import {
  addDays,
  checkRegularOvernight,
  cycleColor,
  cycleFor,
  cycleForDisplay,
  cycleState,
  cycleRemainingDays,
  cycleUsedDays,
  cyclesInRange,
  firstGrantDate,
  grantDatesThrough,
  nextGrantDateAfter,
  regularOvernightAvailableIn,
  regularOvernightBlockMessage,
  regularOvernightPooledRemaining,
  regularOvernightUsageByCycle,
  type RegularOvernightConfig,
  type SegmentLike,
} from "../src";

// 42일 주기, 회당 4일. 주기 시작일은 2026-03-30 → 첫 적립(=1주기 첫날)은 6주 뒤인 2026-05-11.
const config: RegularOvernightConfig = {
  enabled: true,
  startDate: "2026-03-30",
  intervalDays: 42,
  daysPerGrant: 4,
};

describe("정기외박 주기", () => {
  it("설정이 꺼져 있거나 값이 비면 주기가 없다", () => {
    expect(cycleFor({ ...config, enabled: false }, "2026-08-01")).toBe(null);
    expect(cycleFor({ ...config, intervalDays: null }, "2026-08-01")).toBe(
      null,
    );
    expect(cyclesInRange(null, "2026-08-01", "2026-08-31")).toEqual([]);
    expect(firstGrantDate({ ...config, enabled: false })).toBe(null);
  });

  it("첫 적립 전에는 주기가 없다 — 주기 시작일 당일도, 대기 구간 내내도", () => {
    expect(firstGrantDate(config)).toBe("2026-05-11");
    expect(cycleFor(config, "2026-03-29")).toBe(null);
    expect(cycleFor(config, config.startDate!)).toBe(null);
    expect(cycleFor(config, "2026-05-10")).toBe(null);
    expect(cyclesInRange(config, "2026-01-01", "2026-05-10")).toEqual([]);
  });

  it("주기 순번은 첫 적립일에 시작하는 주기를 1로 센다", () => {
    expect(cycleFor(config, "2026-05-11")).toMatchObject({
      index: 1,
      start: "2026-05-11",
      end: "2026-06-21",
      grantDays: 4,
    });
    expect(cycleFor(config, "2026-06-22")).toMatchObject({
      index: 2,
      start: "2026-06-22",
      end: "2026-08-02",
      grantDays: 4,
    });
    expect(cycleFor(config, "2026-08-01")?.index).toBe(2);
  });

  it("주기 첫날과 마지막날이 같은 주기에 속한다", () => {
    const first = cycleFor(config, "2026-05-11");
    expect(cycleFor(config, "2026-06-21")).toEqual(first);
    // 하루 더 가면 다음 주기.
    expect(cycleFor(config, "2026-06-22")?.start).toBe("2026-06-22");
  });

  it("범위와 겹치는 주기를 모두 돌려준다", () => {
    const cycles = cyclesInRange(config, "2026-08-01", "2026-08-31");
    expect(cycles.map((c) => c.start)).toEqual(["2026-06-22", "2026-08-03"]);
  });

  it("범위가 첫 적립일에 걸치면 첫 적립 이후 주기만 돌려준다", () => {
    const cycles = cyclesInRange(config, "2026-04-01", "2026-05-31");
    expect(cycles.map((c) => c.start)).toEqual(["2026-05-11"]);
  });

  it("첫 적립은 주기 시작일이 아니라 한 주기를 채운 뒤다", () => {
    // 주기 시작일 당일에도, 대기 구간 내내도 적립이 없다.
    expect(grantDatesThrough(config, "2026-03-30")).toEqual([]);
    expect(grantDatesThrough(config, "2026-05-10")).toEqual([]);
    // 시작일 + 42일(6주)에 처음 적립된다.
    expect(grantDatesThrough(config, "2026-05-11")).toEqual(["2026-05-11"]);
    expect(grantDatesThrough(config, "2026-08-03")).toEqual([
      "2026-05-11",
      "2026-06-22",
      "2026-08-03",
    ]);
  });

  it("다음 적립일은 오늘이 적립일이면 그 다음 주기다", () => {
    expect(nextGrantDateAfter(config, "2026-03-01")).toBe("2026-05-11");
    expect(nextGrantDateAfter(config, "2026-03-30")).toBe("2026-05-11");
    expect(nextGrantDateAfter(config, "2026-05-10")).toBe("2026-05-11");
    expect(nextGrantDateAfter(config, "2026-05-11")).toBe("2026-06-22");
    expect(
      nextGrantDateAfter({ ...config, enabled: false }, "2026-05-10"),
    ).toBe(null);
  });

  it("주기별로 다른 색을 주고 색이 떨어지면 처음부터 돌려 쓴다", () => {
    expect(cycleColor(1)).not.toBe(cycleColor(2));
    expect(cycleColor(7)).toBe(cycleColor(1));
  });

  it("적립일마다 주기가 하나씩 열리고 마지막 날은 다음 적립 전날이다", () => {
    for (const grantDate of grantDatesThrough(config, "2026-08-03")) {
      const cycle = cycleFor(config, grantDate)!;
      expect(cycle.start).toBe(grantDate);
      expect(cycle.grantDays).toBe(config.daysPerGrant);
      // 주기 마지막 날 + 1 = 다음 적립일.
      expect(addDays(cycle.end, 1)).toBe(nextGrantDateAfter(config, grantDate));
    }
  });

  it("주기와 겹치는 정기외박 구간 일수만 합산한다", () => {
    const cycle = cycleFor(config, "2026-08-05")!; // 2026-08-03 ~ 2026-09-13
    const used = cycleUsedDays(cycle, [
      // 주기 안 정기외박 4일
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-08-06",
        endDate: "2026-08-09",
      },
      // 주기 밖 정기외박 — 세지 않는다
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-07-20",
        endDate: "2026-07-21",
      },
      // 정기외박이 아닌 재원 — 세지 않는다
      {
        category: "annual",
        startDate: "2026-08-02",
        endDate: "2026-08-05",
      },
    ]);
    expect(used).toBe(4);
  });

  it("주기 경계에 걸친 구간은 겹치는 날만 센다", () => {
    const cycle = cycleFor(config, "2026-08-05")!; // 2026-08-03 ~ 2026-09-13
    const used = cycleUsedDays(cycle, [
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-08-01",
        endDate: "2026-08-04",
      },
    ]);
    expect(used).toBe(2);
  });
});

/**
 * 실제 복무 예시로 주기 전체를 한 번 훑는다.
 * 2026-03-23 입대 → 2026-04-24 수료 외박, 그 날부터 6주 주기로 2박 3일씩.
 */
describe("정기외박 주기 — 수료 외박부터 6주 주기 예시", () => {
  const example: RegularOvernightConfig = {
    enabled: true,
    startDate: "2026-04-24",
    intervalDays: 42,
    daysPerGrant: 3,
  };

  it("주기는 입대일이 아니라 수료 외박일을 기준으로 센다", () => {
    expect(cycleFor(example, "2026-03-23")).toBe(null);
    expect(firstGrantDate(example)).toBe("2026-06-05");
  });

  it("수료 외박일부터 6주는 첫 적립을 기다리는 구간이라 주기가 없다", () => {
    expect(cycleFor(example, "2026-04-24")).toBe(null);
    expect(cycleFor(example, "2026-06-04")).toBe(null);
    expect(grantDatesThrough(example, "2026-06-04")).toEqual([]);
  });

  it("6주 뒤인 2026-06-05에 2박 3일이 처음 적립되고 1주기가 시작한다", () => {
    expect(nextGrantDateAfter(example, "2026-04-24")).toBe("2026-06-05");
    expect(grantDatesThrough(example, "2026-06-05")).toEqual(["2026-06-05"]);
    expect(cycleFor(example, "2026-06-05")).toMatchObject({
      index: 1,
      start: "2026-06-05",
      end: "2026-07-16",
      grantDays: 3,
    });
  });

  it("1주기 몫은 다음 적립일 2026-07-17 전날까지 쓴다", () => {
    expect(cycleFor(example, "2026-07-16")?.index).toBe(1);
    expect(nextGrantDateAfter(example, "2026-06-05")).toBe("2026-07-17");
    expect(cycleFor(example, "2026-07-17")).toMatchObject({
      index: 2,
      start: "2026-07-17",
      end: "2026-08-27",
      grantDays: 3,
    });
  });

  it("달력에 그려지는 주기 경계", () => {
    const cycles = cyclesInRange(example, "2026-04-01", "2026-09-01");
    expect(
      cycles.map((c) => `${c.index}주기 ${c.start}~${c.end} ${c.grantDays}일`),
    ).toEqual([
      // 2026-04-24~2026-06-04는 첫 적립 대기 구간이라 주기로 그리지 않는다.
      "1주기 2026-06-05~2026-07-16 3일",
      "2주기 2026-07-17~2026-08-27 3일",
      "3주기 2026-08-28~2026-10-08 3일",
    ]);
  });
});

/**
 * 정기외박은 주기 안에서만 쓸 수 있고 이월되지 않는다.
 * 안 쓰고 주기가 끝나면 그 몫은 사라지고, 다음 주기 몫이 새로 생긴다.
 */
describe("정기외박은 주기 안에서만 쓰고 이월되지 않는다", () => {
  // 2026-04-24 주기 시작, 6주 주기, 회당 2박 3일.
  const example: RegularOvernightConfig = {
    enabled: true,
    startDate: "2026-04-24",
    intervalDays: 42,
    daysPerGrant: 3,
  };
  const seg = (startDate: string, endDate: string) => ({
    category: "overnight" as const,
    overnightKind: "regular" as const,
    startDate,
    endDate,
  });

  it("1주기 몫을 안 쓰고 넘겨도 2주기 몫은 그대로 3일이다", () => {
    // 1주기(6/5~7/16) 내내 한 번도 쓰지 않았다.
    const second = cycleFor(example, "2026-07-20")!;
    expect(second.index).toBe(2);
    expect(cycleRemainingDays(second, [])).toBe(3);
    // 쌓이지 않는다 — 2주기에 쓸 수 있는 건 여전히 3일뿐.
    expect(second.grantDays).toBe(3);
  });

  it("주기 몫을 다 쓰면 그 주기 잔여는 0이 된다", () => {
    const first = cycleFor(example, "2026-06-10")!;
    const used = [seg("2026-06-10", "2026-06-12")];
    expect(cycleUsedDays(first, used)).toBe(3);
    expect(cycleRemainingDays(first, used)).toBe(0);
    // 같은 몫을 다음 주기에서 다시 세지 않는다.
    const second = cycleFor(example, "2026-07-20")!;
    expect(cycleRemainingDays(second, used)).toBe(3);
  });

  it("주기 경계를 넘는 구간은 각 주기 몫에서 나눠 빠진다", () => {
    // 7/15~7/18: 7/15·7/16은 1주기, 7/17·7/18은 2주기.
    const usage = regularOvernightUsageByCycle(example, [
      seg("2026-07-15", "2026-07-18"),
    ]);
    expect(
      usage.cycles
        .filter((entry) => entry.usedDays > 0)
        .map((entry) => [entry.cycle.index, entry.usedDays]),
    ).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(usage.beforeFirstGrantDays).toBe(0);
  });

  it("첫 적립 전 날짜는 어떤 주기에도 속하지 않는다", () => {
    // 주기 시작일 전이든, 시작일과 첫 적립 사이든 똑같이 쓸 수 없는 날이다.
    for (const range of [
      ["2026-04-22", "2026-04-23"],
      ["2026-05-20", "2026-05-21"],
      ["2026-06-03", "2026-06-04"],
    ] as const) {
      const usage = regularOvernightUsageByCycle(example, [
        seg(range[0], range[1]),
      ]);
      expect(usage.beforeFirstGrantDays).toBe(2);
      expect(usage.cycles.every((entry) => entry.usedDays === 0)).toBe(true);
    }
  });

  it("첫 적립일에 걸친 구간은 적립 전 날만 주기 밖으로 센다", () => {
    // 6/4는 첫 적립 전, 6/5·6/6은 1주기.
    const usage = regularOvernightUsageByCycle(example, [
      seg("2026-06-04", "2026-06-06"),
    ]);
    expect(usage.beforeFirstGrantDays).toBe(1);
    expect(
      usage.cycles
        .filter((entry) => entry.usedDays > 0)
        .map((entry) => [entry.cycle.index, entry.usedDays]),
    ).toEqual([[1, 2]]);
  });

  it("자동 적립을 안 쓰면 주기가 없어 전부 주기 밖으로 센다", () => {
    const usage = regularOvernightUsageByCycle(null, [
      seg("2026-06-10", "2026-06-12"),
    ]);
    expect(usage.cycles).toEqual([]);
    expect(usage.beforeFirstGrantDays).toBe(3);
  });
});

describe("전역일 이후에는 주기를 보여주지 않는다", () => {
  // 2주기는 2026-06-22 ~ 2026-08-02. 전역일을 그 한가운데에 둔다.
  const discharge = "2026-07-15";

  it("전역일 당일까지는 그 주기를 그대로 보여준다", () => {
    expect(cycleForDisplay(config, "2026-06-22", discharge)).toEqual(
      cycleFor(config, "2026-06-22"),
    );
    expect(cycleForDisplay(config, discharge, discharge)).toMatchObject({
      index: 2,
      start: "2026-06-22",
      end: "2026-08-02",
    });
  });

  it("전역일 다음 날부터는 주기가 없다 — 그 주기의 남은 날도, 이후 주기도", () => {
    // 아직 2주기 안이지만 이미 전역했다.
    expect(cycleForDisplay(config, addDays(discharge, 1), discharge)).toBe(
      null,
    );
    expect(cycleForDisplay(config, "2026-08-02", discharge)).toBe(null);
    // 적립일이 통째로 전역 뒤인 3주기.
    expect(cycleForDisplay(config, "2026-08-03", discharge)).toBe(null);
    expect(cycleForDisplay(config, "2030-01-01", discharge)).toBe(null);
  });

  it("전역일을 모르면 자르지 않는다", () => {
    for (const date of ["2026-06-22", "2026-08-03", "2030-01-01"]) {
      expect(cycleForDisplay(config, date, null)).toEqual(
        cycleFor(config, date),
      );
      expect(cycleForDisplay(config, date, undefined)).toEqual(
        cycleFor(config, date),
      );
    }
  });

  it("표시용 컷오프는 잔여량 셈을 건드리지 않는다", () => {
    // 화면만 자르고 셈은 그대로여야 한다. 여기가 깨지면 달력을 고치다 잔여량을 바꾼 것이다.
    // 전역일(7/15)이 한가운데인데도 겹치는 주기를 하나도 빼지 않는다.
    const range = cyclesInRange(config, "2026-06-01", "2026-09-30");
    expect(range.map((cycle) => cycle.index)).toEqual([1, 2, 3, 4]);

    const used: SegmentLike[] = [
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-07-20",
        endDate: "2026-07-22",
      },
    ];
    const usage = regularOvernightUsageByCycle(config, used);
    expect(usage.cycles).toHaveLength(1);
    expect(usage.cycles[0]!.cycle.index).toBe(2);
    expect(usage.cycles[0]!.usedDays).toBe(3);
  });
});

describe("주기 진행 상태", () => {
  it("주기 첫날과 마지막날은 진행 중으로 본다", () => {
    const cycle = cycleFor(config, "2026-05-11")!;
    expect(cycleState(cycle, cycle.start)).toBe("current");
    expect(cycleState(cycle, cycle.end)).toBe("current");
    expect(cycleState(cycle, addDays(cycle.start, -1))).toBe("future");
    expect(cycleState(cycle, addDays(cycle.end, 1))).toBe("past");
  });
});

describe("정기외박 사용 가능 여부", () => {
  const discharge = "2027-06-30";
  const regular = (startDate: string, endDate: string): SegmentLike => ({
    category: "overnight",
    overnightKind: "regular",
    startDate,
    endDate,
  });

  it("설정이 꺼져 있으면 주기로 막지 않는다", () => {
    expect(
      checkRegularOvernight({
        config: { ...config, enabled: false },
        existing: [],
        requested: [regular("2026-08-05", "2026-08-06")],
        dischargeAt: discharge,
      }),
    ).toBe(null);
  });

  it("아직 오지 않은 주기라도 그 주기 몫 안이면 쓸 수 있다", () => {
    // 3주기(2026-08-03~09-13)를 오늘보다 한참 뒤로 두고 4일 중 3일만 쓴다.
    expect(
      checkRegularOvernight({
        config,
        existing: [],
        requested: [regular("2026-08-20", "2026-08-22")],
        dischargeAt: discharge,
      }),
    ).toBe(null);
  });

  it("미래 주기라도 그 주기 몫을 넘기면 막는다", () => {
    const block = checkRegularOvernight({
      config,
      existing: [regular("2026-08-05", "2026-08-07")],
      requested: [regular("2026-08-20", "2026-08-21")],
      dischargeAt: discharge,
    });
    expect(block).toEqual({
      kind: "over_cycle",
      cycle: {
        index: 3,
        start: "2026-08-03",
        end: "2026-09-13",
        grantDays: 4,
      },
      usedDays: 5,
    });
    expect(regularOvernightBlockMessage(block!)).toBe(
      "정기외박 3주기(8/3–9/13) 몫 4일을 1일 초과했어요",
    );
  });

  it("선택한 주기와 하루만 겹쳐도 전체 정기외박을 그 주기에서 차감한다", () => {
    const selectedCycle = cycleFor(config, "2026-08-03")!;
    const request = {
      ...regular("2026-07-31", "2026-08-03"),
      regularOvernightCycleStart: selectedCycle.start,
    };
    expect(
      checkRegularOvernight({
        config,
        existing: [],
        requested: [request],
        dischargeAt: discharge,
      }),
    ).toBe(null);
    expect(cycleUsedDays(selectedCycle, [request])).toBe(4);
  });

  it("선택한 주기와 겹치지 않는 정기외박은 막는다", () => {
    const block = checkRegularOvernight({
      config,
      existing: [],
      requested: [
        {
          ...regular("2026-08-03", "2026-08-05"),
          regularOvernightCycleStart: "2026-06-22",
        },
      ],
      dischargeAt: discharge,
    });
    expect(block?.kind).toBe("cycle_mismatch");
  });

  it("다른 주기의 사용량은 섞지 않는다", () => {
    // 2주기를 꽉 채워도 3주기 몫은 그대로다.
    expect(
      checkRegularOvernight({
        config,
        existing: [regular("2026-06-22", "2026-06-25")],
        requested: [regular("2026-08-20", "2026-08-23")],
        dischargeAt: discharge,
      }),
    ).toBe(null);
  });

  it("첫 적립 전 날짜는 막는다", () => {
    const block = checkRegularOvernight({
      config,
      existing: [],
      requested: [regular("2026-05-09", "2026-05-10")],
      dischargeAt: discharge,
    });
    expect(block).toEqual({
      kind: "before_first_grant",
      firstGrantDate: "2026-05-11",
    });
    expect(regularOvernightBlockMessage(block!)).toBe(
      "정기외박은 첫 적립일(5월 11일) 이후부터 사용할 수 있습니다",
    );
  });

  it("적립일이 전역일 뒤인 주기는 막는다", () => {
    // 4주기는 2026-09-14에 적립된다. 전역이 그 전이면 그 몫을 받지 못한다.
    const block = checkRegularOvernight({
      config,
      existing: [],
      requested: [regular("2026-09-20", "2026-09-21")],
      dischargeAt: "2026-09-13",
    });
    expect(block).toEqual({
      kind: "after_discharge",
      cycle: {
        index: 4,
        start: "2026-09-14",
        end: "2026-10-25",
        grantDays: 4,
      },
    });
    expect(regularOvernightBlockMessage(block!)).toBe(
      "정기외박 4주기(9/14–10/25)는 적립일이 전역일 뒤라 쓸 수 없어요",
    );
  });

  it("적립일이 전역일 당일인 주기는 쓸 수 있다", () => {
    expect(
      checkRegularOvernight({
        config,
        existing: [],
        requested: [regular("2026-09-20", "2026-09-21")],
        dischargeAt: "2026-09-14",
      }),
    ).toBe(null);
  });

  it("정기외박이 아닌 구간은 보지 않는다", () => {
    expect(
      checkRegularOvernight({
        config,
        existing: [],
        requested: [
          {
            category: "annual",
            startDate: "2026-05-09",
            endDate: "2026-05-10",
          },
        ],
        dischargeAt: discharge,
      }),
    ).toBe(null);
  });
});

describe("구간 범위 기준 정기외박 잔여", () => {
  const discharge = "2027-06-30";
  const regular = (startDate: string, endDate: string): SegmentLike => ({
    category: "overnight",
    overnightKind: "regular",
    startDate,
    endDate,
  });

  it("아직 오지 않은 주기의 잔여도 그대로 준다", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [],
        dischargeAt: discharge,
        from: "2026-08-20",
        to: "2026-08-21",
      }),
    ).toBe(4);
  });

  it("그 주기에 이미 쓴 만큼 뺀다", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [regular("2026-08-05", "2026-08-07")],
        dischargeAt: discharge,
        from: "2026-08-20",
        to: "2026-08-21",
      }),
    ).toBe(1);
  });

  it("여러 주기에 걸치면 가장 빡빡한 주기를 따른다", () => {
    // 2주기는 3일 썼고(잔여 1) 3주기는 안 썼다(잔여 4). 경계를 걸치면 1.
    expect(
      regularOvernightAvailableIn({
        config,
        used: [regular("2026-06-22", "2026-06-24")],
        dischargeAt: discharge,
        from: "2026-08-01",
        to: "2026-08-05",
      }),
    ).toBe(1);
  });

  it("초과 상태면 음수를 준다 — 칩 숫자와 오류가 어긋나지 않도록", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [regular("2026-08-05", "2026-08-09")],
        dischargeAt: discharge,
        from: "2026-08-20",
        to: "2026-08-21",
      }),
    ).toBe(-1);
  });

  it("첫 적립 전이 끼거나 주기가 없으면 0", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [],
        dischargeAt: discharge,
        from: "2026-05-09",
        to: "2026-05-12",
      }),
    ).toBe(0);
    expect(
      regularOvernightAvailableIn({
        config,
        used: [],
        dischargeAt: discharge,
        from: "2026-04-01",
        to: "2026-04-02",
      }),
    ).toBe(0);
  });

  it("적립일이 전역일 뒤인 주기가 끼면 0", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [],
        dischargeAt: "2026-09-13",
        from: "2026-09-20",
        to: "2026-09-21",
      }),
    ).toBe(0);
  });

  it("설정이 꺼져 있으면 0", () => {
    expect(
      regularOvernightAvailableIn({
        config: { ...config, enabled: false },
        used: [],
        dischargeAt: discharge,
        from: "2026-08-20",
        to: "2026-08-21",
      }),
    ).toBe(0);
  });
});

/**
 * 육군의 통상 운영: 분기(3개월)마다 1박 2일.
 * 기준일을 말일로 잡아 달 산술의 클램핑까지 함께 본다.
 */
const armyConfig: RegularOvernightConfig = {
  enabled: true,
  startDate: "2026-01-31",
  intervalDays: null,
  intervalMonths: 3,
  daysPerGrant: 2,
};

describe("달 단위 주기 (육군 분기)", () => {
  it("적립일이 달력의 같은 날에 떨어진다 — 일수로 세면 밀리는 자리", () => {
    // 3개월 주기를 91일로 근사하면 네 주기(364일)마다 하루씩 앞당겨진다.
    // 2/10 기준 4주기: 달 단위는 2027-02-10, 91일이면 2027-02-09.
    const config: RegularOvernightConfig = {
      ...armyConfig,
      startDate: "2026-02-10",
    };
    expect(grantDatesThrough(config, "2027-03-01")).toEqual([
      "2026-05-10",
      "2026-08-10",
      "2026-11-10",
      "2027-02-10",
    ]);
    expect(
      grantDatesThrough(
        { ...config, intervalDays: 91, intervalMonths: null },
        "2027-03-01",
      ),
    ).toEqual(["2026-05-12", "2026-08-11", "2026-11-10", "2027-02-09"]);
  });

  it("주기는 늘 시작일에서 한 번에 더한다 — 말일이 끌려가지 않는다", () => {
    // 1/31에서 3개월씩 이어 붙이면 4/30 → 7/30이 되지만, 6개월을 한 번에
    // 더하면 7/31이다. 규정이 말하는 것은 후자다.
    expect(grantDatesThrough(armyConfig, "2026-11-01")).toEqual([
      "2026-04-30",
      "2026-07-31",
      "2026-10-31",
    ]);
  });

  it("주기 끝은 다음 적립 전날이라 주기마다 길이가 다르다", () => {
    expect(cycleFor(armyConfig, "2026-04-30")).toEqual({
      index: 1,
      start: "2026-04-30",
      end: "2026-07-30",
      grantDays: 2,
    });
    expect(cycleFor(armyConfig, "2026-07-31")).toEqual({
      index: 2,
      start: "2026-07-31",
      end: "2026-10-30",
      grantDays: 2,
    });
  });

  it("첫 적립 전에는 주기가 없다 — 기준일 당일도, 대기 구간 내내도", () => {
    expect(firstGrantDate(armyConfig)).toBe("2026-04-30");
    expect(cycleFor(armyConfig, "2026-01-31")).toBe(null);
    expect(cycleFor(armyConfig, "2026-04-29")).toBe(null);
    expect(cycleFor(armyConfig, "2025-12-01")).toBe(null);
    expect(cyclesInRange(armyConfig, "2026-01-01", "2026-04-29")).toEqual([]);
  });

  it("범위에 걸친 주기를 빠짐없이 준다", () => {
    expect(
      cyclesInRange(armyConfig, "2026-07-01", "2026-11-01").map((c) => c.index),
    ).toEqual([1, 2, 3]);
    expect(cyclesInRange(armyConfig, "2026-08-01", "2026-08-31")).toEqual([
      { index: 2, start: "2026-07-31", end: "2026-10-30", grantDays: 2 },
    ]);
  });

  it("다음 적립일 — 적립일 당일에 물으면 그다음 주기를 준다", () => {
    expect(nextGrantDateAfter(armyConfig, "2026-01-01")).toBe("2026-04-30");
    expect(nextGrantDateAfter(armyConfig, "2026-04-29")).toBe("2026-04-30");
    expect(nextGrantDateAfter(armyConfig, "2026-04-30")).toBe("2026-07-31");
  });

  it("주기 몫 1박 2일을 넘기면 막고, 주기가 바뀌면 다시 쓸 수 있다", () => {
    const used: SegmentLike[] = [
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-05-01",
        endDate: "2026-05-02",
      },
    ];
    // 1주기(4/30~7/30) 몫 2일을 이미 다 썼다.
    expect(
      checkRegularOvernight({
        config: armyConfig,
        existing: used,
        requested: [
          {
            category: "overnight",
            overnightKind: "regular",
            startDate: "2026-06-01",
            endDate: "2026-06-01",
          },
        ],
        dischargeAt: "2027-06-30",
      }),
    ).toMatchObject({ kind: "over_cycle", usedDays: 3 });

    // 2주기(7/31~)는 새 몫이라 통과한다 — 이월이 아니라 주기별 적립이다.
    expect(
      checkRegularOvernight({
        config: armyConfig,
        existing: used,
        requested: [
          {
            category: "overnight",
            overnightKind: "regular",
            startDate: "2026-08-01",
            endDate: "2026-08-02",
          },
        ],
        dischargeAt: "2027-06-30",
      }),
    ).toBe(null);
  });

  it("일수 주기가 함께 저장돼 있어도 달 단위를 따른다", () => {
    // 군종을 바꾸다 앞 군의 값이 남아도 답이 흔들리지 않아야 한다.
    expect(firstGrantDate({ ...armyConfig, intervalDays: 42 })).toBe(
      "2026-04-30",
    );
  });

  it("두 주기 값이 모두 비면 주기가 없다", () => {
    expect(
      cycleFor({ ...armyConfig, intervalMonths: null }, "2026-05-01"),
    ).toBe(null);
  });
});

describe("이월을 켜면 주기 몫이 쌓인다", () => {
  // 2026-04-24 주기 시작, 42일 주기, 회당 3일.
  //   첫 적립 2026-06-05 = 1주기 첫날
  //   1주기 2026-06-05 ~ 2026-07-16
  //   2주기 2026-07-17 ~ 2026-08-27
  //   3주기 2026-08-28 ~ 2026-10-08
  const carry: RegularOvernightConfig = {
    enabled: true,
    startDate: "2026-04-24",
    intervalDays: 42,
    daysPerGrant: 3,
    carryOver: true,
  };
  const strict: RegularOvernightConfig = { ...carry, carryOver: false };
  const dischargeAt = "2028-12-31";
  const seg = (startDate: string, endDate: string): SegmentLike => ({
    category: "overnight",
    overnightKind: "regular",
    startDate,
    endDate,
  });
  const check = (
    config: RegularOvernightConfig,
    requested: SegmentLike[],
    existing: SegmentLike[] = [],
  ) => checkRegularOvernight({ config, existing, requested, dischargeAt });
  const pooled = (used: SegmentLike[], on: string) =>
    regularOvernightPooledRemaining({ config: carry, used, dischargeAt, on });

  it("한 주기를 통째로 넘기면 다음 주기에 두 주기 몫이 쌓인다", () => {
    // 이월이 없을 때 이 자리의 잔여는 3일이다(위 "이월되지 않는다" 묶음).
    expect(pooled([], "2026-07-20")).toBe(6);
    expect(pooled([], "2026-08-30")).toBe(9);
  });

  it("첫 적립 전에는 쌓인 몫이 없다", () => {
    expect(pooled([], "2026-06-04")).toBe(0);
    // 첫 적립일 당일에 1주기 몫이 들어온다.
    expect(pooled([], "2026-06-05")).toBe(3);
  });

  it("쌓인 몫 안이면 한 주기 몫보다 많이 쓸 수 있다", () => {
    // 1주기를 통째로 남기고 2주기에 5일 — 누적 6일 안이라 통과한다.
    expect(check(carry, [seg("2026-07-20", "2026-07-24")])).toBeNull();
    // 같은 요청이 이월을 끄면 그 주기 몫 3일을 넘겨 막힌다.
    expect(check(strict, [seg("2026-07-20", "2026-07-24")])).toEqual({
      kind: "over_cycle",
      cycle: expect.objectContaining({ index: 2 }),
      usedDays: 5,
    });
  });

  it("쌓인 몫을 넘기면 견준 기준일과 함께 막는다", () => {
    const block = check(carry, [seg("2026-07-20", "2026-07-26")]);
    expect(block).toEqual({
      kind: "over_pool",
      cycle: expect.objectContaining({ index: 2, end: "2026-08-27" }),
      grantedDays: 6,
      usedDays: 7,
    });
    expect(regularOvernightBlockMessage(block!)).toBe(
      "8월 27일까지 쌓이는 정기외박 6일을 1일 초과했어요",
    );
  });

  it("이미 저장된 구간까지 더해 누적을 센다", () => {
    // 1주기에 이미 3일을 썼으면 2주기까지의 누적 여유는 3일뿐이다.
    const existing = [seg("2026-06-10", "2026-06-12")];
    expect(
      check(carry, [seg("2026-07-20", "2026-07-22")], existing),
    ).toBeNull();
    expect(check(carry, [seg("2026-07-20", "2026-07-23")], existing)).toEqual(
      expect.objectContaining({
        kind: "over_pool",
        grantedDays: 6,
        usedDays: 7,
      }),
    );
  });

  it("주기 경계에서 앞선 주기의 상한이 먼저 걸린다", () => {
    // 1주기 마지막 날(7/16)까지 4일을 쓰면 그 시점 누적 몫 3일을 넘는다.
    // 뒤에 2주기 몫이 들어온다고 해서 앞당겨 쓸 수는 없다.
    const block = check(carry, [
      {
        ...seg("2026-07-13", "2026-07-18"),
        regularOvernightCycleStart: "2026-06-05",
      },
    ]);
    expect(block).toEqual({
      kind: "over_pool",
      cycle: expect.objectContaining({ index: 1, end: "2026-07-16" }),
      grantedDays: 3,
      usedDays: 6,
    });
  });

  it("주기 마지막 날까지 딱 맞게 쓰는 것은 막지 않는다", () => {
    // 7/14~7/16 = 3일이 1주기 몫과 정확히 같다.
    expect(check(carry, [seg("2026-07-14", "2026-07-16")])).toBeNull();
  });

  it("첫 적립 전 날짜는 이월과 무관하게 막힌다", () => {
    expect(check(carry, [seg("2026-06-03", "2026-06-04")])).toEqual({
      kind: "before_first_grant",
      firstGrantDate: "2026-06-05",
    });
  });

  it("적립일이 전역 뒤인 주기는 이월을 켜도 받지 못한다", () => {
    // 3주기 적립일은 2026-08-28. 전역이 그 하루 전이면 그 몫은 애초에 없다.
    const block = checkRegularOvernight({
      config: carry,
      existing: [],
      requested: [seg("2026-08-28", "2026-08-29")],
      dischargeAt: "2026-08-27",
    });
    expect(block).toEqual(expect.objectContaining({ kind: "after_discharge" }));
    // 전역일 당일이 적립일이면 그 주기는 받는다.
    expect(
      checkRegularOvernight({
        config: carry,
        existing: [],
        requested: [seg("2026-08-28", "2026-08-29")],
        dischargeAt: "2026-08-28",
      }),
    ).toBeNull();
  });

  it("쌓인 몫도 전역일까지 받는 것만 센다", () => {
    // 오늘이 한참 뒤라도 전역일이 2주기 안이면 3주기 몫은 들어오지 않는다.
    expect(
      regularOvernightPooledRemaining({
        config: carry,
        used: [],
        dischargeAt: "2026-08-01",
        on: "2027-01-01",
      }),
    ).toBe(6);
  });

  it("주기별 잔여를 그대로 더하면 누적 잔여가 된다", () => {
    // 서버 합계(regularOvernightSummary)가 기대는 성질이다. 이월분까지 당겨 쓴
    // 주기는 음수가 되어 앞선 주기의 남은 몫을 정확히 상쇄한다.
    const used = [seg("2026-07-20", "2026-07-24")];
    const cycles = cyclesInRange(carry, "2026-06-05", "2026-08-27");
    const sum = cycles.reduce(
      (total, cycle) => total + cycleRemainingDays(cycle, used),
      0,
    );
    expect(cycles.map((cycle) => cycleRemainingDays(cycle, used))).toEqual([
      3, -2,
    ]);
    expect(sum).toBe(1);
    expect(pooled(used, "2026-08-27")).toBe(1);
  });

  it("구간 범위 잔여도 누적 기준으로 답한다", () => {
    const available = (from: string, to: string, used: SegmentLike[] = []) =>
      regularOvernightAvailableIn({
        config: carry,
        used,
        dischargeAt,
        from,
        to,
      });
    // 2주기 안이면 두 주기 몫이 다 보인다.
    expect(available("2026-07-20", "2026-07-22")).toBe(6);
    // 1주기에 걸치면 그 시점 누적 3일이 상한이다(가장 빡빡한 주기를 따른다).
    expect(available("2026-07-15", "2026-07-20")).toBe(3);
    // 이미 넘겨 쓴 상태는 음수로 그대로 내보낸다 — 칩 숫자와 차단 시점이 어긋나지 않게.
    expect(
      available("2026-07-20", "2026-07-22", [seg("2026-07-01", "2026-07-08")]),
    ).toBeLessThan(0);
  });

  it("이월을 끄면 같은 입력이 다시 주기별로 막힌다", () => {
    // 되돌릴 수 있다는 보장 — 잔여가 전부 설정에서 파생하므로 남는 것이 없다.
    const requested = [seg("2026-07-20", "2026-07-24")];
    expect(check(carry, requested)).toBeNull();
    expect(check(strict, requested)).toEqual(
      expect.objectContaining({ kind: "over_cycle" }),
    );
    expect(
      regularOvernightPooledRemaining({
        config: strict,
        used: [],
        dischargeAt,
        on: "2026-07-20",
      }),
    ).toBe(6);
  });
});

describe("달 단위 주기의 이월", () => {
  // 육군의 분기 주기. 2026-01-31 시작 → 첫 적립 2026-04-30, 2주기 2026-07-31.
  // 달 산술을 쓰므로 말일이 끌려가지 않는다(1/31 + 6개월 = 7/31).
  const carry: RegularOvernightConfig = {
    enabled: true,
    startDate: "2026-01-31",
    intervalDays: null,
    intervalMonths: 3,
    daysPerGrant: 2,
    carryOver: true,
  };
  const dischargeAt = "2027-12-31";
  const seg = (startDate: string, endDate: string): SegmentLike => ({
    category: "overnight",
    overnightKind: "regular",
    startDate,
    endDate,
  });

  it("말일이 끌려가지 않은 채로 누적된다", () => {
    expect(firstGrantDate(carry)).toBe("2026-04-30");
    expect(cycleFor(carry, "2026-08-01")).toMatchObject({
      index: 2,
      start: "2026-07-31",
      end: "2026-10-30",
    });
    // 1·2주기 몫이 함께 쌓여 4일.
    expect(
      regularOvernightPooledRemaining({
        config: carry,
        used: [],
        dischargeAt,
        on: "2026-08-01",
      }),
    ).toBe(4);
  });

  it("쌓인 몫으로 한 주기 몫(2일)보다 길게 쓸 수 있다", () => {
    expect(
      checkRegularOvernight({
        config: carry,
        existing: [],
        requested: [seg("2026-08-01", "2026-08-04")],
        dischargeAt,
      }),
    ).toBeNull();
    expect(
      checkRegularOvernight({
        config: carry,
        existing: [],
        requested: [seg("2026-08-01", "2026-08-05")],
        dischargeAt,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "over_pool",
        grantedDays: 4,
        usedDays: 5,
      }),
    );
  });
});
