import { describe, expect, it } from "vitest";
import {
  cycleColor,
  cycleFor,
  cycleUsedDays,
  cyclesInRange,
  grantDatesThrough,
  nextGrantDateAfter,
  type RegularOvernightConfig,
} from "../src";

// 42일 주기, 회당 4일. 적립 시작일은 2026-03-30.
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

  it("적립 시작일 이전에는 주기가 없다", () => {
    expect(cycleFor(config, "2026-03-29")).toBe(null);
    expect(cyclesInRange(config, "2026-01-01", "2026-03-29")).toEqual([]);
  });

  it("주기 순번은 적립 시작일이 속한 주기를 1로 센다", () => {
    expect(cycleFor(config, config.startDate!)).toMatchObject({
      index: 1,
      start: "2026-03-30",
      end: "2026-05-10",
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

  it("범위가 적립 시작일에 걸치면 시작일 이후 주기만 돌려준다", () => {
    const cycles = cyclesInRange(config, "2026-03-01", "2026-03-31");
    expect(cycles.map((c) => c.start)).toEqual(["2026-03-30"]);
  });

  it("적립 시작일부터 주기마다 적립일이 돌아온다", () => {
    expect(grantDatesThrough(config, "2026-03-29")).toEqual([]);
    expect(grantDatesThrough(config, "2026-03-30")).toEqual(["2026-03-30"]);
    expect(grantDatesThrough(config, "2026-06-21")).toEqual([
      "2026-03-30",
      "2026-05-11",
    ]);
    expect(grantDatesThrough(config, "2026-08-03")).toEqual([
      "2026-03-30",
      "2026-05-11",
      "2026-06-22",
      "2026-08-03",
    ]);
  });

  it("다음 적립일은 오늘이 적립일이면 그 다음 주기다", () => {
    expect(nextGrantDateAfter(config, "2026-03-01")).toBe("2026-03-30");
    expect(nextGrantDateAfter(config, "2026-03-30")).toBe("2026-05-11");
    expect(nextGrantDateAfter(config, "2026-05-10")).toBe("2026-05-11");
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
