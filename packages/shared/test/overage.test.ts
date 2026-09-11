import { describe, expect, it } from "vitest";
import {
  computeDayStats,
  findExceededDates,
  maxAllowedOut,
  outingDatesOfSegments,
  usersOnLeaveDuring,
  type LeaveSpan,
} from "../src";

describe("maxAllowedOut", () => {
  it("uses the configured count, including zero", () => {
    expect(maxAllowedOut(4)).toBe(4);
    expect(maxAllowedOut(0)).toBe(0);
  });

  it("normalizes missing or malformed values to zero", () => {
    expect(maxAllowedOut(null)).toBe(0);
    expect(maxAllowedOut(undefined)).toBe(0);
    expect(maxAllowedOut(-3)).toBe(0);
    expect(maxAllowedOut(2.7)).toBe(2);
  });
});

describe("computeDayStats", () => {
  const leaves: LeaveSpan[] = [
    { userId: "a", startDate: "2026-08-01", endDate: "2026-08-03" },
    { userId: "b", startDate: "2026-08-02", endDate: "2026-08-04" },
    { userId: "c", startDate: "2026-08-03", endDate: "2026-08-03" },
  ];

  it("counts distinct users per day and flags overage", () => {
    const stats = computeDayStats({
      leaves,
      maxCount: 2,
      rangeStart: "2026-08-01",
      rangeEnd: "2026-08-05",
    });
    const byDate = Object.fromEntries(stats.map((s) => [s.date, s]));
    expect(byDate["2026-08-01"]).toMatchObject({ count: 1, exceeded: false });
    expect(byDate["2026-08-02"]).toMatchObject({ count: 2, exceeded: false });
    expect(byDate["2026-08-03"]).toMatchObject({ count: 3, exceeded: true });
    expect(byDate["2026-08-04"]).toMatchObject({ count: 1, exceeded: false });
    expect(byDate["2026-08-05"]).toMatchObject({ count: 0, exceeded: false });
  });

  it("dedupes overlapping leaves from the same user", () => {
    const stats = computeDayStats({
      leaves: [
        { userId: "a", startDate: "2026-08-01", endDate: "2026-08-02" },
        { userId: "a", startDate: "2026-08-02", endDate: "2026-08-03" },
      ],
      maxCount: 2,
      rangeStart: "2026-08-02",
      rangeEnd: "2026-08-02",
    });
    expect(stats[0]?.count).toBe(1);
  });

  it("clips leaves that extend beyond the range", () => {
    const stats = computeDayStats({
      leaves: [{ userId: "a", startDate: "2026-07-20", endDate: "2026-09-10" }],
      maxCount: 1,
      rangeStart: "2026-08-01",
      rangeEnd: "2026-08-02",
    });
    expect(stats.every((s) => s.count === 1)).toBe(true);
  });

  it("uses the configured count for overage", () => {
    const stats = computeDayStats({
      leaves,
      maxCount: 1,
      rangeStart: "2026-08-01",
      rangeEnd: "2026-08-02",
    });
    expect(stats[0]).toMatchObject({ count: 1, allowed: 1, exceeded: false });
    expect(stats[1]).toMatchObject({ count: 2, allowed: 1, exceeded: true });
  });

  it("can exclude a later return day without dropping a same-day outing", () => {
    const stats = computeDayStats({
      leaves: [
        { userId: "overnight", startDate: "2026-08-14", endDate: "2026-08-15" },
        { userId: "outing", startDate: "2026-08-15", endDate: "2026-08-15" },
      ],
      maxCount: 2,
      rangeStart: "2026-08-14",
      rangeEnd: "2026-08-15",
      returnDayCounts: false,
    });

    expect(stats).toMatchObject([
      { date: "2026-08-14", count: 1 },
      { date: "2026-08-15", count: 1 },
    ]);
  });

  it("counts outings by default even when the unit can opt out", () => {
    const stats = computeDayStats({
      leaves: [
        {
          userId: "a",
          startDate: "2026-08-15",
          endDate: "2026-08-15",
          outingDates: ["2026-08-15"],
        },
      ],
      maxCount: 2,
      rangeStart: "2026-08-15",
      rangeEnd: "2026-08-15",
    });
    expect(stats[0]?.count).toBe(1);
  });

  it("drops outing days when the unit does not count them", () => {
    const stats = computeDayStats({
      leaves: [
        {
          userId: "a",
          startDate: "2026-08-15",
          endDate: "2026-08-15",
          outingDates: ["2026-08-15"],
        },
        { userId: "b", startDate: "2026-08-15", endDate: "2026-08-16" },
      ],
      maxCount: 2,
      rangeStart: "2026-08-15",
      rangeEnd: "2026-08-16",
      outingCounts: false,
    });

    expect(stats).toMatchObject([
      { date: "2026-08-15", count: 1, userIds: ["b"] },
      { date: "2026-08-16", count: 1 },
    ]);
  });

  it("still counts someone whose other leave covers the same day as an outing", () => {
    const stats = computeDayStats({
      leaves: [
        {
          userId: "a",
          startDate: "2026-08-15",
          endDate: "2026-08-15",
          outingDates: ["2026-08-15"],
        },
        { userId: "a", startDate: "2026-08-14", endDate: "2026-08-15" },
      ],
      maxCount: 2,
      rangeStart: "2026-08-15",
      rangeEnd: "2026-08-15",
      outingCounts: false,
    });
    expect(stats[0]?.count).toBe(1);
  });

  it("drops an excluded outing only once when return days are not counted", () => {
    // 하루짜리 외출은 복귀일 특례로 살아남은 뒤 외출 단계에서 빠진다. 두 규칙이
    // 겹쳐도 없는 날을 한 번 더 빼거나 앞날까지 지우지 않아야 한다.
    const stats = computeDayStats({
      leaves: [
        {
          userId: "outing",
          startDate: "2026-08-15",
          endDate: "2026-08-15",
          outingDates: ["2026-08-15"],
        },
        { userId: "overnight", startDate: "2026-08-14", endDate: "2026-08-15" },
      ],
      maxCount: 2,
      rangeStart: "2026-08-14",
      rangeEnd: "2026-08-15",
      returnDayCounts: false,
      outingCounts: false,
    });

    expect(stats).toMatchObject([
      { date: "2026-08-14", count: 1 },
      { date: "2026-08-15", count: 0 },
    ]);
  });

  it("keeps calendar-day math stable across year and leap-day boundaries", () => {
    const stats = computeDayStats({
      leaves: [
        { userId: "year", startDate: "2025-12-30", endDate: "2026-01-02" },
        { userId: "leap", startDate: "2028-02-28", endDate: "2028-03-01" },
      ],
      maxCount: 1,
      rangeStart: "2025-12-30",
      rangeEnd: "2028-03-01",
    });

    const byDate = new Map(stats.map((day) => [day.date, day.count]));
    expect(byDate.get("2025-12-31")).toBe(1);
    expect(byDate.get("2026-01-01")).toBe(1);
    expect(byDate.get("2028-02-29")).toBe(1);
  });
});

describe("outingDatesOfSegments", () => {
  it("keeps only outing segments and spreads multi-day legacy rows", () => {
    expect(
      outingDatesOfSegments([
        { category: "annual", startDate: "2026-08-01", endDate: "2026-08-03" },
        { category: "outing", startDate: "2026-08-05", endDate: "2026-08-05" },
        { category: "outing", startDate: "2026-08-08", endDate: "2026-08-09" },
      ]),
    ).toEqual(["2026-08-05", "2026-08-08", "2026-08-09"]);
  });

  it("returns nothing for a leave without outing segments", () => {
    expect(
      outingDatesOfSegments([
        { category: "annual", startDate: "2026-08-01", endDate: "2026-08-01" },
      ]),
    ).toEqual([]);
  });
});

describe("findExceededDates", () => {
  it("returns only the exceeded dates within the new leave span", () => {
    const existing: LeaveSpan[] = [
      { userId: "a", startDate: "2026-08-01", endDate: "2026-08-03" },
      { userId: "b", startDate: "2026-08-03", endDate: "2026-08-05" },
    ];
    const newLeave = {
      userId: "c",
      startDate: "2026-08-02",
      endDate: "2026-08-04",
    };
    const dates = findExceededDates({
      leaves: [...existing, newLeave],
      newLeave,
      maxCount: 2,
    });
    expect(dates).toEqual(["2026-08-03"]); // a+b+c 3명 → 초과
  });

  it("does not flag a date the unit's excluded outings would have pushed over", () => {
    const newLeave = {
      userId: "c",
      startDate: "2026-08-03",
      endDate: "2026-08-03",
    };
    const leaves: LeaveSpan[] = [
      { userId: "a", startDate: "2026-08-03", endDate: "2026-08-03" },
      {
        userId: "b",
        startDate: "2026-08-03",
        endDate: "2026-08-03",
        outingDates: ["2026-08-03"],
      },
      newLeave,
    ];
    expect(findExceededDates({ leaves, newLeave, maxCount: 2 })).toEqual([
      "2026-08-03",
    ]);
    expect(
      findExceededDates({ leaves, newLeave, maxCount: 2, outingCounts: false }),
    ).toEqual([]);
  });

  it("returns empty when nothing exceeds", () => {
    const newLeave = {
      userId: "a",
      startDate: "2026-08-01",
      endDate: "2026-08-02",
    };
    expect(
      findExceededDates({
        leaves: [newLeave],
        newLeave,
        maxCount: 2,
      }),
    ).toEqual([]);
  });
});

describe("usersOnLeaveDuring", () => {
  it("collects distinct users overlapping any of the dates", () => {
    const leaves: LeaveSpan[] = [
      { userId: "a", startDate: "2026-08-01", endDate: "2026-08-03" },
      { userId: "b", startDate: "2026-08-05", endDate: "2026-08-06" },
      { userId: "c", startDate: "2026-08-03", endDate: "2026-08-03" },
    ];
    expect(usersOnLeaveDuring(leaves, ["2026-08-03"]).sort()).toEqual([
      "a",
      "c",
    ]);
    expect(usersOnLeaveDuring(leaves, ["2026-08-04"])).toEqual([]);
  });
});
