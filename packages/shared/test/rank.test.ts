import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  currentRank,
  eachDate,
  fullMonthsBetween,
  getRankInfo,
  isDischargedOn,
  isValidISODate,
  kstMidnight,
  monthBounds,
  nextPromotionDate,
  normalizeLegacyDischargeDate,
  scheduledRank,
  serviceProgressAt,
  standardDischargeDate,
  standardPromotionDate,
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

describe("standardDischargeDate", () => {
  it("ends service on the day before the corresponding date", () => {
    expect(standardDischargeDate("2026-03-23", "air_force")).toBe("2027-12-22");
    expect(standardDischargeDate("2026-03-23", "army")).toBe("2027-09-22");
    expect(standardDischargeDate("2026-03-23", "navy")).toBe("2027-11-22");
    expect(standardDischargeDate("2026-03-01", "air_force")).toBe("2027-11-30");
  });

  it("uses the last day when the final month has no corresponding date", () => {
    expect(standardDischargeDate("2025-08-31", "army")).toBe("2027-02-28");
    expect(standardDischargeDate("2026-08-31", "army")).toBe("2028-02-29");
  });

  it("corrects only the previous automatic default for existing accounts", () => {
    expect(
      normalizeLegacyDischargeDate("2026-03-23", "air_force", "2027-12-23"),
    ).toBe("2027-12-22");
    expect(
      normalizeLegacyDischargeDate("2026-03-23", "air_force", "2027-12-30"),
    ).toBe("2027-12-30");
  });
});

describe("standardPromotionDate", () => {
  it("uses the first of the month after the minimum period is met", () => {
    expect(standardPromotionDate("2026-01-10", "private_first")).toBe(
      "2026-04-01",
    );
    expect(standardPromotionDate("2026-01-10", "corporal")).toBe("2026-10-01");
    expect(standardPromotionDate("2026-01-10", "sergeant")).toBe("2027-04-01");
  });

  it("keeps the first when the minimum period is met on the first", () => {
    expect(standardPromotionDate("2026-01-01", "private_first")).toBe(
      "2026-03-01",
    );
  });
});

describe("scheduledRank", () => {
  const enlisted = "2026-01-10";

  it("promotes 이병→일병 on the first after 2 months", () => {
    expect(scheduledRank(enlisted, "2026-01-10")).toBe("private");
    expect(scheduledRank(enlisted, "2026-03-31")).toBe("private");
    expect(scheduledRank(enlisted, "2026-04-01")).toBe("private_first");
  });

  it("promotes 일병→상병 on the first after 8 months", () => {
    expect(scheduledRank(enlisted, "2026-09-30")).toBe("private_first");
    expect(scheduledRank(enlisted, "2026-10-01")).toBe("corporal");
  });

  it("promotes 상병→병장 on the first after 14 months", () => {
    expect(scheduledRank(enlisted, "2027-03-31")).toBe("corporal");
    expect(scheduledRank(enlisted, "2027-04-01")).toBe("sergeant");
    expect(scheduledRank(enlisted, "2030-01-01")).toBe("sergeant");
  });
});

describe("currentRank with signup rank floor", () => {
  it("keeps the higher signup rank until schedule catches up", () => {
    const enlisted = "2026-01-10";
    // 표준 일정상 이병이지만 가입 시 상병으로 등록한 경우
    expect(
      currentRank({
        enlistedAt: enlisted,
        signupRank: "corporal",
        on: "2026-02-01",
      }),
    ).toBe("corporal");
    // 일정이 병장에 도달하면 병장으로 진급
    expect(
      currentRank({
        enlistedAt: enlisted,
        signupRank: "corporal",
        on: "2027-04-01",
      }),
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
    ).toBe("2026-04-01");
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

describe("isDischargedOn", () => {
  it("전역일 당일부터 전역으로 본다", () => {
    expect(isDischargedOn("2027-07-04", "2027-07-03")).toBe(false);
    expect(isDischargedOn("2027-07-04", "2027-07-04")).toBe(true);
    expect(isDischargedOn("2027-07-04", "2027-07-05")).toBe(true);
  });

  it("진행률이 100%가 되는 시점과 어긋나지 않는다", () => {
    const enlistedAt = "2026-01-05";
    const dischargeAt = "2027-07-04";
    // 전역일 00:00(KST)에 이미 100%다 — 그 하루를 "복무 중"으로 두면 문구와 어긋난다.
    const atDischarge = kstMidnight(dischargeAt);
    expect(serviceProgressAt(enlistedAt, dischargeAt, atDischarge)).toBe(1);
    expect(isDischargedOn(dischargeAt, dischargeAt)).toBe(true);
  });
});
