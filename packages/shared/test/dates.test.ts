import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsClamped,
  diffDays,
  eachDate,
  fullMonthsBetween,
  isValidISODate,
  monthBounds,
  rangesOverlap,
  shiftDateRange,
} from "../src";

describe("isValidISODate", () => {
  it("형식과 실제 존재하는 날짜만 유효", () => {
    expect(isValidISODate("2026-07-18")).toBe(true);
    expect(isValidISODate("2026-02-29")).toBe(false); // 2026은 평년
    expect(isValidISODate("2024-02-29")).toBe(true); // 2024는 윤년
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2026-7-1")).toBe(false); // 자리수
    expect(isValidISODate("hello")).toBe(false);
  });
});

describe("addDays / diffDays / eachDate", () => {
  it("월 경계를 넘어 더한다", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("두 날짜 차이(일)", () => {
    expect(diffDays("2026-01-01", "2026-01-10")).toBe(9);
    expect(diffDays("2026-01-10", "2026-01-01")).toBe(-9);
  });
  it("포함 범위의 모든 날짜", () => {
    expect(eachDate("2026-01-01", "2026-01-03")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(eachDate("2026-01-05", "2026-01-05")).toEqual(["2026-01-05"]);
  });
});

describe("addMonthsClamped", () => {
  it("말일 초과분은 그 달 말일로 클램프", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
  });
  it("연도 경계를 넘어간다", () => {
    expect(addMonthsClamped("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("fullMonthsBetween", () => {
  it("만 개월 수를 센다", () => {
    expect(fullMonthsBetween("2026-01-05", "2026-07-04")).toBe(5);
    expect(fullMonthsBetween("2026-01-05", "2026-07-05")).toBe(6);
    expect(fullMonthsBetween("2026-07-05", "2026-01-05")).toBe(0);
  });
});

describe("monthBounds / rangesOverlap", () => {
  it("달의 첫날/마지막날", () => {
    expect(monthBounds("2026-02")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
  it("범위 겹침 판정", () => {
    expect(
      rangesOverlap("2026-01-01", "2026-01-10", "2026-01-10", "2026-01-20"),
    ).toBe(true);
    expect(
      rangesOverlap("2026-01-01", "2026-01-09", "2026-01-10", "2026-01-20"),
    ).toBe(false);
  });
});

describe("shiftDateRange", () => {
  it("기간 전체를 같은 일수만큼 민다", () => {
    expect(
      shiftDateRange({ startDate: "2026-03-10", endDate: "2026-03-12" }, 5),
    ).toEqual({ startDate: "2026-03-15", endDate: "2026-03-17" });
  });

  it("음수면 앞으로 민다", () => {
    expect(
      shiftDateRange({ startDate: "2026-03-01", endDate: "2026-03-01" }, -1),
    ).toEqual({ startDate: "2026-02-28", endDate: "2026-02-28" });
  });

  it("달과 해의 경계를 넘어도 길이를 보존한다", () => {
    expect(
      shiftDateRange({ startDate: "2026-12-30", endDate: "2027-01-02" }, 3),
    ).toEqual({ startDate: "2027-01-02", endDate: "2027-01-05" });
  });

  it("0이면 그대로 둔다", () => {
    expect(
      shiftDateRange({ startDate: "2026-03-10", endDate: "2026-03-12" }, 0),
    ).toEqual({ startDate: "2026-03-10", endDate: "2026-03-12" });
  });
});
