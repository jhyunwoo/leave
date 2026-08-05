import { describe, expect, it } from "vitest";
import {
  availabilitySignal,
  recommendDateRanges,
  type AvailabilityDay,
} from "../src/availability";
import { monthsSpanning } from "../src/calendar";

describe("availabilitySignal", () => {
  it("기준 없음·여유·보통·임박·초과를 절대 인원 없이 구분한다", () => {
    expect(availabilitySignal(0, 0)).toEqual({
      key: "unknown",
      label: "기준 미설정",
      percent: null,
    });
    expect(availabilitySignal(1, 4).key).toBe("roomy");
    expect(availabilitySignal(2, 4).key).toBe("normal");
    expect(availabilitySignal(4, 4)).toEqual({
      key: "near",
      label: "임박",
      percent: 100,
    });
    expect(availabilitySignal(5, 4).key).toBe("exceeded");
  });
});

describe("recommendDateRanges", () => {
  const days: AvailabilityDay[] = Array.from({ length: 15 }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    count: index === 6 ? 4 : index % 3,
    allowed: 3,
    blocked: index === 8,
  }));

  it("블랙아웃과 초과일을 피하고 피크 비율이 낮은 인접 구간을 추천한다", () => {
    const result = recommendDateRanges({
      days,
      selectedStart: "2026-08-06",
      durationDays: 2,
      radiusDays: 5,
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      startDate: "2026-08-04",
      endDate: "2026-08-05",
      peakPercent: 33,
    });
    expect(result.every((range) => range.startDate !== "2026-08-07")).toBe(
      true,
    );
    expect(result.every((range) => range.startDate !== "2026-08-09")).toBe(
      true,
    );
  });

  it("윤년과 월 경계에서도 날짜 문자열을 그대로 유지한다", () => {
    const boundary: AvailabilityDay[] = [
      { date: "2028-02-28", count: 0, allowed: 2 },
      { date: "2028-02-29", count: 0, allowed: 2 },
      { date: "2028-03-01", count: 0, allowed: 2 },
      { date: "2028-03-02", count: 0, allowed: 2 },
    ];
    expect(
      recommendDateRanges({
        days: boundary,
        selectedStart: "2028-03-01",
        durationDays: 2,
        radiusDays: 2,
        limit: 1,
      }),
    ).toEqual([
      {
        startDate: "2028-02-29",
        endDate: "2028-03-01",
        peakPercent: 0,
      },
    ]);
  });
});

describe("월 경계 데이터 공급", () => {
  it("추천 반경이 걸치는 달을 monthsSpanning이 모두 알려준다", () => {
    // 8/1에 반경 14일이면 7월까지, 8/31에 반경 14일이면 9월까지 필요하다.
    expect(monthsSpanning("2026-07-18", "2026-08-15")).toEqual([
      "2026-07",
      "2026-08",
    ]);
    expect(monthsSpanning("2026-08-17", "2026-09-14")).toEqual([
      "2026-08",
      "2026-09",
    ]);
    expect(monthsSpanning("2026-12-20", "2027-01-10")).toEqual([
      "2026-12",
      "2027-01",
    ]);
    expect(monthsSpanning("2026-08-10", "2026-08-12")).toEqual(["2026-08"]);
  });

  it("이웃 달까지 받아오면 월초 후보가 사라지지 않는다", () => {
    // 한 달치만 들고 계산하면 7월 후보가 전부 "데이터 없음"으로 버려졌다.
    const augustOnly: AvailabilityDay[] = Array.from(
      { length: 5 },
      (_, index) => ({
        date: `2026-08-0${index + 1}`,
        count: 2,
        allowed: 3,
      }),
    );
    const withJuly: AvailabilityDay[] = [
      { date: "2026-07-30", count: 0, allowed: 3 },
      { date: "2026-07-31", count: 0, allowed: 3 },
      ...augustOnly,
    ];

    const input = {
      selectedStart: "2026-08-02",
      durationDays: 2,
      radiusDays: 14,
      limit: 1,
    };
    expect(recommendDateRanges({ ...input, days: augustOnly })[0]).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      peakPercent: 67,
    });
    expect(recommendDateRanges({ ...input, days: withJuly })[0]).toEqual({
      startDate: "2026-07-30",
      endDate: "2026-07-31",
      peakPercent: 0,
    });
  });
});
