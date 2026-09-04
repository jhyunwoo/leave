import { describe, expect, it } from "vitest";
import { buildWidgetSource } from "../src/widgets/sources";
import { defaultWidgetPreferences } from "../src/widgets/preferences";
import type { WidgetSourceInput } from "../src/widgets/sources";

const TODAY = "2026-06-15";

function leave(over: Record<string, unknown> = {}) {
  return {
    id: "leave-1",
    title: "정기외박",
    startDate: "2026-06-20",
    endDate: "2026-06-22",
    status: "approved",
    segments: [
      {
        category: "regular_overnight",
        startDate: "2026-06-20",
        endDate: "2026-06-22",
        days: 3,
      },
    ],
    ...over,
  } as unknown as NonNullable<WidgetSourceInput["leaves"]>[number];
}

function calendar(over: Record<string, unknown> = {}) {
  return {
    month: "2026-06",
    days: [
      {
        date: "2026-06-20",
        count: 4,
        allowed: 10,
        exceeded: false,
        blocked: false,
      },
    ],
    events: [],
    leaves: [],
    attendees: [],
    blackouts: [],
    ...over,
  } as unknown as NonNullable<WidgetSourceInput["calendars"]>[number];
}

function input(over: Partial<WidgetSourceInput> = {}): WidgetSourceInput {
  return {
    state: "ready",
    today: TODAY,
    me: {
      user: {
        enlistedAt: "2025-06-15",
        dischargeAt: "2026-12-14",
        rank: "corporal",
      },
      unit: { id: "unit-1" },
    } as unknown as WidgetSourceInput["me"],
    dutyDays: { dutyDays: 100, from: TODAY, through: "2026-12-13" },
    leaves: [leave()],
    balances: {
      balances: [
        {
          key: "annual",
          cycleScoped: false,
          remainingAsOfTodayDays: 12,
          upcomingAsOfTodayDays: 0,
          upcomingDays: 0,
          plannedDays: 3,
          expiringSoonDays: 0,
          expiredDays: 0,
        },
      ],
    } as unknown as WidgetSourceInput["balances"],
    calendars: [calendar()],
    preferences: defaultWidgetPreferences,
    ...over,
  };
}

describe("위젯 재료", () => {
  it("복무정보를 프로필로 옮긴다", () => {
    expect(buildWidgetSource(input()).profile).toEqual({
      enlistedAt: "2025-06-15",
      dischargeAt: "2026-12-14",
      rank: "corporal",
    });
  });

  it("로그인 정보가 아직 없으면 프로필이 null", () => {
    expect(buildWidgetSource(input({ me: undefined })).profile).toBeNull();
  });

  it("서버가 센 날이 오늘이면 그 값을 그대로 쓴다", () => {
    expect(buildWidgetSource(input()).dutyDaysToday).toBe(100);
  });

  it("어제 받아 둔 일과일은 그 사이 보낸 만큼 뺀다", () => {
    // 6/12(금)에 센 100일. 6/12·6/15는 평일이고 6/13·6/14는 주말이라
    // [6/12, 6/14] 구간의 일과일은 6/12 하루뿐이다.
    const source = buildWidgetSource(
      input({
        dutyDays: { dutyDays: 100, from: "2026-06-12", through: "2026-12-13" },
      }),
    );
    expect(source.dutyDaysToday).toBe(99);
  });

  it("일과일 응답이 없으면 null", () => {
    expect(
      buildWidgetSource(input({ dutyDays: undefined })).dutyDaysToday,
    ).toBeNull();
  });

  it("외출 구간은 일과일에서 빼지 않는다", () => {
    // 외출은 같은 날 복귀하므로 그날 일과가 사라지지 않는다 (서버와 같은 규칙).
    const source = buildWidgetSource(
      input({
        leaves: [
          leave({
            segments: [
              {
                category: "outing",
                startDate: "2026-06-16",
                endDate: "2026-06-16",
                days: 1,
              },
              {
                category: "annual",
                startDate: "2026-06-17",
                endDate: "2026-06-18",
                days: 2,
              },
            ],
          }),
        ],
      }),
    );
    expect(source.leaveRanges).toEqual([
      { startDate: "2026-06-17", endDate: "2026-06-18" },
    ]);
  });

  it("집계 대상이 아닌 휴가는 일과일에서 빼지 않는다", () => {
    const source = buildWidgetSource(
      input({
        leaves: [leave({ status: "draft" }), leave({ status: "cancelled" })],
      }),
    );
    expect(source.leaveRanges).toEqual([]);
    // 다만 목록 자체는 그대로 넘긴다 — 무엇을 셀지는 payload가 정한다.
    expect(source.leaves).toHaveLength(2);
  });

  it("구간이 없는 휴가는 휴가 자체의 날짜 범위로 대신한다", () => {
    const source = buildWidgetSource(
      input({ leaves: [leave({ segments: [] })] }),
    );
    expect(source.leaveRanges).toEqual([
      { startDate: "2026-06-20", endDate: "2026-06-22" },
    ]);
  });

  it("부대 휴일만 모으고, 두 달에 걸친 일정도 한 번만 센다", () => {
    const event = {
      id: "event-1",
      isHoliday: true,
      startDate: "2026-06-30",
      endDate: "2026-07-02",
    };
    const source = buildWidgetSource(
      input({
        calendars: [
          calendar({
            events: [
              event,
              {
                id: "event-2",
                isHoliday: false,
                startDate: "2026-06-18",
                endDate: "2026-06-18",
              },
            ],
          }),
          calendar({ month: "2026-07", days: [], events: [event] }),
        ],
      }),
    );
    expect(source.unitHolidays).toEqual([
      { startDate: "2026-06-30", endDate: "2026-07-02" },
    ]);
  });

  it("출타 여유는 아직 오지 않은 가장 빠른 휴가의 첫날을 본다", () => {
    const source = buildWidgetSource(
      input({
        leaves: [
          leave({
            id: "later",
            startDate: "2026-07-01",
            endDate: "2026-07-02",
          }),
          leave(),
        ],
      }),
    );
    expect(source.snapshot.headroom).toEqual({
      date: "2026-06-20",
      count: 4,
      allowed: 10,
      blocked: false,
    });
  });

  it("이미 나가 있는 휴가는 출타 여유의 기준이 되지 않는다", () => {
    // 첫날이 지난 휴가에 "몇 명 더 갈 수 있나"를 물어도 뜻이 없다.
    const source = buildWidgetSource(
      input({
        leaves: [leave({ startDate: "2026-06-14", endDate: "2026-06-16" })],
      }),
    );
    expect(source.snapshot.headroom).toBeNull();
  });

  it("그날 달력을 아직 못 받았으면 출타 여유가 없다", () => {
    expect(
      buildWidgetSource(input({ calendars: [undefined] })).snapshot.headroom,
    ).toBeNull();
  });

  it("잔여 휴가는 재원 합계로 접는다", () => {
    expect(buildWidgetSource(input()).snapshot.holdings).toMatchObject({
      remaining: 12,
      planned: 3,
    });
  });

  it("설정한 지표 구성을 그대로 넘긴다", () => {
    const source = buildWidgetSource(
      input({
        preferences: {
          defaultMetric: "balance",
          summaryMetrics: ["nextLeave", "progress"],
        },
      }),
    );
    expect(source.defaultMetric).toBe("balance");
    expect(source.summaryMetrics).toEqual(["nextLeave", "progress"]);
  });
});
