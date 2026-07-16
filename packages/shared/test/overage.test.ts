import { describe, expect, it } from "vitest";
import {
  computeDayStats,
  findExceededDates,
  maxAllowedOut,
  usersOnLeaveDuring,
  type LeaveSpan,
} from "../src";

const ratio13 = { numerator: 1, denominator: 3 };

describe("maxAllowedOut", () => {
  it("floors the allowed count", () => {
    expect(maxAllowedOut(9, ratio13)).toBe(3);
    expect(maxAllowedOut(10, ratio13)).toBe(3);
    expect(maxAllowedOut(2, ratio13)).toBe(0);
    expect(maxAllowedOut(4, { numerator: 1, denominator: 2 })).toBe(2);
  });

  it("guards against a zero denominator", () => {
    expect(maxAllowedOut(10, { numerator: 1, denominator: 0 })).toBe(0);
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
      memberCount: 6, // 허용 인원 = floor(6/3) = 2
      ratio: ratio13,
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
      memberCount: 6,
      ratio: ratio13,
      rangeStart: "2026-08-02",
      rangeEnd: "2026-08-02",
    });
    expect(stats[0]?.count).toBe(1);
  });

  it("clips leaves that extend beyond the range", () => {
    const stats = computeDayStats({
      leaves: [{ userId: "a", startDate: "2026-07-20", endDate: "2026-09-10" }],
      memberCount: 3,
      ratio: ratio13,
      rangeStart: "2026-08-01",
      rangeEnd: "2026-08-02",
    });
    expect(stats.every((s) => s.count === 1)).toBe(true);
  });
});

describe("findExceededDates", () => {
  it("returns only the exceeded dates within the new leave span", () => {
    const existing: LeaveSpan[] = [
      { userId: "a", startDate: "2026-08-01", endDate: "2026-08-03" },
      { userId: "b", startDate: "2026-08-03", endDate: "2026-08-05" },
    ];
    const newLeave = { userId: "c", startDate: "2026-08-02", endDate: "2026-08-04" };
    const dates = findExceededDates({
      leaves: [...existing, newLeave],
      newLeave,
      memberCount: 6, // 허용 2명
      ratio: ratio13,
    });
    expect(dates).toEqual(["2026-08-03"]); // a+b+c 3명 → 초과
  });

  it("returns empty when nothing exceeds", () => {
    const newLeave = { userId: "a", startDate: "2026-08-01", endDate: "2026-08-02" };
    expect(
      findExceededDates({
        leaves: [newLeave],
        newLeave,
        memberCount: 6,
        ratio: ratio13,
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
    expect(usersOnLeaveDuring(leaves, ["2026-08-03"]).sort()).toEqual(["a", "c"]);
    expect(usersOnLeaveDuring(leaves, ["2026-08-04"])).toEqual([]);
  });
});
