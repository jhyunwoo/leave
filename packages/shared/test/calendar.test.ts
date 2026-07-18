import { describe, expect, it } from "vitest";
import { buildMonthGrid, fmtRange, shiftMonth, splitMonth } from "../src";

describe("shiftMonth", () => {
  it("연도 경계를 넘어 이동", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-06", 0)).toBe("2026-06");
  });
});

describe("splitMonth", () => {
  it("연/월 분리", () => {
    expect(splitMonth("2026-07")).toEqual({ year: 2026, monthNum: 7 });
  });
});

describe("buildMonthGrid", () => {
  it("일요일 시작 그리드이며 해당 월의 모든 날짜를 포함한다", () => {
    const weeks = buildMonthGrid("2026-02");
    // 각 주는 7일
    for (const week of weeks) expect(week.length).toBe(7);
    // 첫 셀은 일요일(0)
    const first = weeks[0]?.[0];
    expect(first).toBeDefined();
    const firstDow = new Date(`${first!.date}T00:00:00Z`).getUTCDay();
    expect(firstDow).toBe(0);
    // 2월의 모든 날짜가 inMonth로 존재
    const inMonth = weeks.flat().filter((c) => c.inMonth).map((c) => c.date);
    expect(inMonth).toContain("2026-02-01");
    expect(inMonth).toContain("2026-02-28");
    expect(inMonth.length).toBe(28);
  });
});

describe("fmtRange", () => {
  it("같은 날은 단일 표기, 다른 날은 범위 표기", () => {
    expect(fmtRange("2026-07-18", "2026-07-18")).toBe("7월 18일");
    expect(fmtRange("2026-07-18", "2026-07-20")).toContain("–");
  });
});
