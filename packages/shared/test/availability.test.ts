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

  it("겹치는 구간을 한 번만 훑어도 기존 순위 규칙과 같은 결과를 낸다", () => {
    const addDays = (date: string, amount: number) => {
      const value = new Date(`${date}T00:00:00.000Z`);
      value.setUTCDate(value.getUTCDate() + amount);
      return value.toISOString().slice(0, 10);
    };
    const naive = (input: {
      days: readonly AvailabilityDay[];
      selectedStart: string;
      durationDays: number;
      radiusDays?: number;
      limit?: number;
    }) => {
      const duration = Math.trunc(input.durationDays);
      if (duration <= 0) return [];
      const byDate = new Map(input.days.map((day) => [day.date, day]));
      const radius = Math.max(duration, input.radiusDays ?? 14);
      const selectedEnd = addDays(input.selectedStart, duration - 1);
      const candidates: Array<{
        startDate: string;
        endDate: string;
        peakPercent: number;
        distance: number;
      }> = [];

      for (let offset = -radius; offset <= radius; offset += 1) {
        const startDate = addDays(input.selectedStart, offset);
        const endDate = addDays(startDate, duration - 1);
        if (startDate === input.selectedStart && endDate === selectedEnd) {
          continue;
        }
        const range: AvailabilityDay[] = [];
        let valid = true;
        for (let index = 0; index < duration; index += 1) {
          const day = byDate.get(addDays(startDate, index));
          if (
            !day ||
            day.blocked ||
            day.allowed <= 0 ||
            day.count > day.allowed
          ) {
            valid = false;
            break;
          }
          range.push(day);
        }
        if (!valid) continue;
        candidates.push({
          startDate,
          endDate,
          peakPercent: Math.max(
            ...range.map((day) =>
              Math.round((Math.max(0, day.count) / day.allowed) * 100),
            ),
          ),
          distance: Math.abs(offset),
        });
      }

      return candidates
        .sort(
          (a, b) =>
            a.peakPercent - b.peakPercent ||
            a.distance - b.distance ||
            a.startDate.localeCompare(b.startDate),
        )
        .slice(0, input.limit ?? 3)
        .map(({ distance: _distance, ...range }) => range);
    };

    const selectedStart = "2028-02-20";
    const generatedDays: AvailabilityDay[] = Array.from(
      { length: 181 },
      (_, index) => {
        const offset = index - 90;
        const allowed = offset % 29 === 0 ? 0 : 5;
        return {
          date: addDays(selectedStart, offset),
          count: offset % 17 === 0 ? 6 : Math.abs(offset * 7) % 6,
          allowed,
          blocked: offset % 31 === 0,
        };
      },
    );

    for (const durationDays of [1, 2, 7, 14, 30]) {
      for (const limit of [1, 3, 7]) {
        const input = { generatedDays, durationDays, limit };
        const args = {
          days: input.generatedDays,
          selectedStart,
          durationDays: input.durationDays,
          radiusDays: 45,
          limit: input.limit,
        };
        expect(recommendDateRanges(args)).toEqual(naive(args));
      }
    }

    for (const radiusDays of [2.25, 3.75]) {
      const args = {
        days: generatedDays,
        selectedStart,
        durationDays: 2,
        radiusDays,
        limit: 7,
      };
      expect(recommendDateRanges(args)).toEqual(naive(args));
    }

    expect(
      recommendDateRanges({
        days: generatedDays,
        selectedStart,
        durationDays: 2,
        radiusDays: Number.NaN,
      }),
    ).toEqual([]);
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
