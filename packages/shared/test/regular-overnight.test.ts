import { describe, expect, it } from "vitest";
import {
  cycleFor,
  cycleUsedDays,
  cyclesInRange,
  type RegularOvernightConfig,
} from "../src";

const ENLISTED = "2026-03-23";

// 42일 주기, 회당 4일. 앵커(다음 적립일)는 2026-08-12.
const config: RegularOvernightConfig = {
  enabled: true,
  nextGrantDate: "2026-08-12",
  intervalDays: 42,
  daysPerGrant: 4,
};

describe("정기외박 주기", () => {
  it("설정이 꺼져 있거나 값이 비면 주기가 없다", () => {
    expect(
      cycleFor({ ...config, enabled: false }, "2026-08-01", ENLISTED),
    ).toBe(null);
    expect(
      cycleFor({ ...config, intervalDays: null }, "2026-08-01", ENLISTED),
    ).toBe(null);
    expect(cyclesInRange(null, "2026-08-01", "2026-08-31", ENLISTED)).toEqual(
      [],
    );
  });

  it("앵커 이전 날짜도 거꾸로 세어 주기를 찾는다", () => {
    const cycle = cycleFor(config, "2026-07-01", ENLISTED);
    expect(cycle).toMatchObject({ start: "2026-07-01", end: "2026-08-11" });
  });

  it("주기 첫날과 마지막날이 같은 주기에 속한다", () => {
    const first = cycleFor(config, "2026-07-01", ENLISTED);
    const last = cycleFor(config, "2026-08-11", ENLISTED);
    expect(last).toEqual(first);
    // 하루 더 가면 다음 주기.
    expect(cycleFor(config, "2026-08-12", ENLISTED)?.start).toBe("2026-08-12");
  });

  it("주기 순번은 입대일이 속한 주기를 1로 센다", () => {
    // 앵커에서 42일씩 거슬러 올라가면 입대일 2026-03-23은 2026-02-25 시작 주기에 속한다.
    expect(cycleFor(config, ENLISTED, ENLISTED)).toMatchObject({
      index: 1,
      start: "2026-02-25",
    });
    expect(cycleFor(config, "2026-07-01", ENLISTED)?.index).toBe(4);
  });

  it("범위와 겹치는 주기를 모두 돌려준다", () => {
    const cycles = cyclesInRange(config, "2026-08-01", "2026-08-31", ENLISTED);
    expect(cycles.map((c) => c.start)).toEqual(["2026-07-01", "2026-08-12"]);
  });

  it("주기와 겹치는 정기외박 구간 일수만 합산한다", () => {
    const cycle = cycleFor(config, "2026-08-01", ENLISTED)!;
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
        startDate: "2026-08-20",
        endDate: "2026-08-21",
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
    const cycle = cycleFor(config, "2026-08-01", ENLISTED)!; // ~2026-08-11
    const used = cycleUsedDays(cycle, [
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-08-10",
        endDate: "2026-08-13",
      },
    ]);
    expect(used).toBe(2);
  });
});
