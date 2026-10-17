import { describe, expect, it } from "vitest";
import { buildWatchSource } from "../src/widgets/watch-source";
import type { WidgetSource } from "../src/widgets/payload";

const TODAY = "2026-06-15"; // 월요일

function source(over: Partial<WidgetSource> = {}): WidgetSource {
  return {
    state: "ready",
    today: TODAY,
    profile: {
      enlistedAt: "2025-06-15",
      dischargeAt: "2026-06-29",
      rank: "corporal",
    },
    dutyDaysToday: 9,
    leaves: [],
    unitHolidays: [],
    leaveRanges: [],
    snapshot: { holdings: null, headroom: null },
    defaultMetric: "discharge",
    summaryMetrics: [],
    ...over,
  } as WidgetSource;
}

function leave(over: Record<string, unknown> = {}) {
  return {
    id: "leave-1",
    title: "정기외박",
    startDate: "2026-06-20",
    endDate: "2026-06-22",
    status: "approved",
    returnTime: null,
    segments: [{ category: "regular_overnight" }],
    ...over,
  } as unknown as WidgetSource["leaves"][number];
}

describe("워치 재료", () => {
  it("오늘부터 전역 전날까지의 일과일 날짜를 센다", () => {
    const watch = buildWatchSource(
      source({
        unitHolidays: [{ startDate: "2026-06-17", endDate: "2026-06-17" }],
        leaveRanges: [{ startDate: "2026-06-25", endDate: "2026-06-26" }],
      }),
      TODAY,
    );
    // 6/20·21, 6/27·28은 주말, 6/17은 부대 휴일, 6/25·26은 휴가, 6/29는 전역일.
    expect(watch.dutyDays).toEqual({
      from: TODAY,
      days: 9,
      dates: [
        "2026-06-15",
        "2026-06-16",
        "2026-06-18",
        "2026-06-19",
        "2026-06-22",
        "2026-06-23",
        "2026-06-24",
      ],
    });
  });

  it("일과일 응답이 없으면 dutyDays가 null", () => {
    expect(
      buildWatchSource(source({ dutyDaysToday: null }), TODAY).dutyDays,
    ).toBeNull();
  });

  it("끝나지 않은 집계 대상 휴가만 외출 여부와 함께 넘긴다", () => {
    const watch = buildWatchSource(
      source({
        leaves: [
          leave(),
          leave({ id: "done", startDate: "2026-06-01", endDate: "2026-06-14" }),
          leave({ id: "draft", status: "draft" }),
          leave({
            id: "outing",
            title: "평일 외출",
            startDate: "2026-06-16",
            endDate: "2026-06-16",
            returnTime: "21:30",
            segments: [{ category: "outing" }],
          }),
        ],
      }),
      TODAY,
    );
    expect(watch.leaves).toEqual([
      {
        title: "정기외박",
        startDate: "2026-06-20",
        endDate: "2026-06-22",
        returnTime: null,
        outing: false,
      },
      {
        title: "평일 외출",
        startDate: "2026-06-16",
        endDate: "2026-06-16",
        returnTime: "21:30",
        outing: true,
      },
    ]);
  });
});
