import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  currentRank,
  eachDate,
  fullMonthsBetween,
  getRankInfo,
  isValidISODate,
  monthBounds,
  nextPromotionDate,
  scheduledRank,
} from "../src";

describe("dates", () => {
  it("validates ISO dates", () => {
    expect(isValidISODate("2026-02-28")).toBe(true);
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2026-1-1")).toBe(false);
  });

  it("clamps month-end when adding months", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2026-01-15", 2)).toBe("2026-03-15");
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("computes full months between dates", () => {
    expect(fullMonthsBetween("2026-01-15", "2026-03-14")).toBe(1);
    expect(fullMonthsBetween("2026-01-15", "2026-03-15")).toBe(2);
    expect(fullMonthsBetween("2026-01-31", "2026-02-28")).toBe(1);
    expect(fullMonthsBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(fullMonthsBetween("2026-03-01", "2026-01-01")).toBe(0);
  });

  it("enumerates inclusive date ranges", () => {
    expect(eachDate("2026-02-27", "2026-03-01")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });

  it("computes month bounds", () => {
    expect(monthBounds("2026-02")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(monthBounds("2024-02").end).toBe("2024-02-29");
  });
});

describe("scheduledRank", () => {
  const enlisted = "2026-01-10";

  it("promotes 이병→일병 at 2 months", () => {
    expect(scheduledRank(enlisted, "2026-01-10")).toBe("private");
    expect(scheduledRank(enlisted, "2026-03-09")).toBe("private");
    expect(scheduledRank(enlisted, "2026-03-10")).toBe("private_first");
  });

  it("promotes 일병→상병 at 8 months", () => {
    expect(scheduledRank(enlisted, "2026-09-09")).toBe("private_first");
    expect(scheduledRank(enlisted, "2026-09-10")).toBe("corporal");
  });

  it("promotes 상병→병장 at 14 months", () => {
    expect(scheduledRank(enlisted, "2027-03-09")).toBe("corporal");
    expect(scheduledRank(enlisted, "2027-03-10")).toBe("sergeant");
    expect(scheduledRank(enlisted, "2030-01-01")).toBe("sergeant");
  });
});

describe("currentRank with signup rank floor", () => {
  it("keeps the higher signup rank until schedule catches up", () => {
    const enlisted = "2026-01-10";
    // 표준 일정상 이병이지만 가입 시 상병으로 등록한 경우
    expect(
      currentRank({ enlistedAt: enlisted, signupRank: "corporal", on: "2026-02-01" }),
    ).toBe("corporal");
    // 일정이 병장에 도달하면 병장으로 진급
    expect(
      currentRank({ enlistedAt: enlisted, signupRank: "corporal", on: "2027-03-10" }),
    ).toBe("sergeant");
  });

  it("uses scheduled rank when signup rank is lower", () => {
    expect(
      currentRank({
        enlistedAt: "2025-01-01",
        signupRank: "private",
        on: "2026-07-01",
      }),
    ).toBe("sergeant");
  });
});

describe("nextPromotionDate", () => {
  it("returns the scheduled promotion date", () => {
    expect(
      nextPromotionDate({
        enlistedAt: "2026-01-10",
        signupRank: "private",
        on: "2026-02-01",
      }),
    ).toBe("2026-03-10");
  });

  it("returns null for 병장", () => {
    expect(
      nextPromotionDate({
        enlistedAt: "2025-01-01",
        signupRank: "private",
        on: "2026-07-01",
      }),
    ).toBeNull();
  });
});

describe("getRankInfo", () => {
  it("computes service progress and D-day", () => {
    const info = getRankInfo({
      enlistedAt: "2026-01-01",
      dischargeAt: "2027-07-01",
      signupRank: "private",
      on: "2026-01-01",
    });
    expect(info.serviceProgress).toBe(0);
    expect(info.daysUntilDischarge).toBe(546);

    const done = getRankInfo({
      enlistedAt: "2026-01-01",
      dischargeAt: "2027-07-01",
      signupRank: "private",
      on: "2027-07-01",
    });
    expect(done.serviceProgress).toBe(1);
    expect(done.daysUntilDischarge).toBe(0);
    expect(done.rank).toBe("sergeant");
  });
});
