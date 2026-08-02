import { describe, expect, it } from "vitest";
import {
  addDays,
  cycleColor,
  cycleFor,
  cycleState,
  cycleRemainingDays,
  cycleUsedDays,
  cyclesInRange,
  grantDatesThrough,
  nextGrantDateAfter,
  regularOvernightUsageByCycle,
  type RegularOvernightConfig,
} from "../src";

// 42일 주기, 회당 4일. 주기 시작일은 2026-03-30 → 첫 적립은 6주 뒤인 2026-05-11.
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
  });

  it("주기 시작일 이전에는 주기가 없다", () => {
    expect(cycleFor(config, "2026-03-29")).toBe(null);
    expect(cyclesInRange(config, "2026-01-01", "2026-03-29")).toEqual([]);
  });

  it("주기 순번은 주기 시작일이 속한 주기를 1로 센다", () => {
    expect(cycleFor(config, config.startDate!)).toMatchObject({
      index: 1,
      start: "2026-03-30",
      end: "2026-05-10",
      // 1주기는 첫 적립을 기다리는 구간이라 쥔 일수가 없다.
      grantDays: 0,
    });
    expect(cycleFor(config, "2026-05-11")).toMatchObject({
      index: 2,
      grantDays: 4,
    });
    expect(cycleFor(config, "2026-05-11")?.index).toBe(2);
    expect(cycleFor(config, "2026-08-01")?.index).toBe(3);
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

  it("범위가 주기 시작일에 걸치면 시작일 이후 주기만 돌려준다", () => {
    const cycles = cyclesInRange(config, "2026-03-01", "2026-03-31");
    expect(cycles.map((c) => c.start)).toEqual(["2026-03-30"]);
  });

  it("첫 적립은 주기 시작일이 아니라 한 주기를 채운 뒤다", () => {
    // 주기 시작일 당일에도, 1주기 내내도 적립이 없다.
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

  it("주기는 입대일이 아니라 수료 외박일부터 센다", () => {
    expect(cycleFor(example, "2026-03-23")).toBe(null);
    expect(cycleFor(example, "2026-04-23")).toBe(null);
    expect(cycleFor(example, "2026-04-24")?.index).toBe(1);
  });

  it("1주기는 첫 적립을 기다리는 구간이라 정기외박이 0일이다", () => {
    expect(cycleFor(example, "2026-04-24")).toMatchObject({
      start: "2026-04-24",
      end: "2026-06-04",
      grantDays: 0,
    });
    expect(grantDatesThrough(example, "2026-06-04")).toEqual([]);
  });

  it("6주 뒤인 2026-06-05에 2박 3일이 처음 적립된다", () => {
    expect(nextGrantDateAfter(example, "2026-04-24")).toBe("2026-06-05");
    expect(grantDatesThrough(example, "2026-06-05")).toEqual(["2026-06-05"]);
    expect(cycleFor(example, "2026-06-05")).toMatchObject({
      index: 2,
      start: "2026-06-05",
      end: "2026-07-16",
      grantDays: 3,
    });
  });

  it("2주기 몫은 다음 주기가 시작하는 2026-07-17 전날까지 쓴다", () => {
    expect(cycleFor(example, "2026-07-16")?.index).toBe(2);
    expect(nextGrantDateAfter(example, "2026-06-05")).toBe("2026-07-17");
    expect(cycleFor(example, "2026-07-17")).toMatchObject({
      index: 3,
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
      "1주기 2026-04-24~2026-06-04 0일",
      "2주기 2026-06-05~2026-07-16 3일",
      "3주기 2026-07-17~2026-08-27 3일",
      "4주기 2026-08-28~2026-10-08 3일",
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

  it("2주기 몫을 안 쓰고 넘겨도 3주기 몫은 그대로 3일이다", () => {
    // 2주기(6/5~7/16) 내내 한 번도 쓰지 않았다.
    const third = cycleFor(example, "2026-07-20")!;
    expect(third.index).toBe(3);
    expect(cycleRemainingDays(third, [])).toBe(3);
    // 쌓이지 않는다 — 3주기에 쓸 수 있는 건 여전히 3일뿐.
    expect(third.grantDays).toBe(3);
  });

  it("주기 몫을 다 쓰면 그 주기 잔여는 0이 된다", () => {
    const second = cycleFor(example, "2026-06-10")!;
    const used = [seg("2026-06-10", "2026-06-12")];
    expect(cycleUsedDays(second, used)).toBe(3);
    expect(cycleRemainingDays(second, used)).toBe(0);
    // 같은 몫을 다음 주기에서 다시 세지 않는다.
    const third = cycleFor(example, "2026-07-20")!;
    expect(cycleRemainingDays(third, used)).toBe(3);
  });

  it("주기 경계를 넘는 구간은 각 주기 몫에서 나눠 빠진다", () => {
    // 7/15~7/18: 7/15·7/16은 2주기, 7/17·7/18은 3주기.
    const usage = regularOvernightUsageByCycle(example, [
      seg("2026-07-15", "2026-07-18"),
    ]);
    expect(
      usage.cycles
        .filter((entry) => entry.usedDays > 0)
        .map((entry) => [entry.cycle.index, entry.usedDays]),
    ).toEqual([
      [2, 2],
      [3, 2],
    ]);
    expect(usage.beforeStartDays).toBe(0);
  });

  it("주기 시작 전 날짜는 어떤 주기에도 속하지 않는다", () => {
    const usage = regularOvernightUsageByCycle(example, [
      seg("2026-04-22", "2026-04-23"),
    ]);
    expect(usage.beforeStartDays).toBe(2);
    expect(usage.cycles.every((entry) => entry.usedDays === 0)).toBe(true);
  });

  it("자동 적립을 안 쓰면 주기가 없어 전부 주기 밖으로 센다", () => {
    const usage = regularOvernightUsageByCycle(null, [
      seg("2026-06-10", "2026-06-12"),
    ]);
    expect(usage.cycles).toEqual([]);
    expect(usage.beforeStartDays).toBe(3);
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
