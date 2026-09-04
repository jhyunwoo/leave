import { describe, expect, it } from "vitest";
import { lastDutyDayCandidate, remainingDutyDays } from "../src";

/** 공휴일이 없는 2026년 6월의 두 주. 월요일 6/15 ~ 금요일 6/26. */
const plainWeeks = {
  monday: "2026-06-15",
  friday: "2026-06-19",
  nextMonday: "2026-06-22",
  nextSaturday: "2026-06-27",
};

function count(
  from: string,
  dischargeAt: string,
  extra: {
    unitHolidays?: { startDate: string; endDate: string }[];
    leaves?: { startDate: string; endDate: string }[];
  } = {},
) {
  return remainingDutyDays({
    from,
    dischargeAt,
    unitHolidays: extra.unitHolidays ?? [],
    leaves: extra.leaves ?? [],
  });
}

describe("남은 일과일", () => {
  it("주말을 뺀 평일만 센다", () => {
    // 6/15(월)~6/26(금): 두 주의 평일 10일. 사이의 토·일 네 날은 빠진다.
    expect(count(plainWeeks.monday, plainWeeks.nextSaturday)).toBe(10);
  });

  it("시작일 당일이 평일이면 그 날도 센다", () => {
    // 6/15(월) 하루만 남은 경우 — 전역은 다음날.
    expect(count(plainWeeks.monday, "2026-06-16")).toBe(1);
  });

  it("전역일 당일은 평일이어도 세지 않는다", () => {
    // 6/15(월)~6/19(금) 중 전역일 6/19를 빼면 네 날.
    expect(count(plainWeeks.monday, plainWeeks.friday)).toBe(4);
    // 같은 구간이라도 전역일이 토요일이면 평일 다섯 날이 그대로 남는다.
    expect(count(plainWeeks.monday, "2026-06-20")).toBe(5);
  });

  it("공휴일과 대체공휴일을 뺀다", () => {
    // 2026-03-01(삼일절)이 일요일이라 3/2(월)이 대체공휴일이다.
    expect(count("2026-03-02", "2026-03-07")).toBe(4);
    // 2026-06-06(현충일)은 토요일이고 대체공휴일 대상이 아니다 — 다음 주는 온전한 5일.
    expect(count("2026-06-08", "2026-06-13")).toBe(5);
  });

  it("부대 휴일을 뺀다", () => {
    expect(
      count(plainWeeks.monday, plainWeeks.nextSaturday, {
        unitHolidays: [{ startDate: "2026-06-17", endDate: "2026-06-18" }],
      }),
    ).toBe(8);
  });

  it("개인 휴가를 뺀다", () => {
    expect(
      count(plainWeeks.monday, plainWeeks.nextSaturday, {
        leaves: [{ startDate: plainWeeks.monday, endDate: plainWeeks.friday }],
      }),
    ).toBe(5);
  });

  it("겹치는 휴일·휴가를 두 번 빼지 않는다", () => {
    // 부대 휴일 6/17~6/21과 휴가 6/16~6/23이 겹친다. 둘의 합집합이 지우는 평일은
    // 6/16~6/19와 6/22~6/23 여섯 날이고, 남는 평일은 6/15·6/24·6/25·6/26 네 날이다.
    expect(
      count(plainWeeks.monday, plainWeeks.nextSaturday, {
        unitHolidays: [{ startDate: "2026-06-17", endDate: "2026-06-21" }],
        leaves: [{ startDate: "2026-06-16", endDate: "2026-06-23" }],
      }),
    ).toBe(4);
    expect(
      count(plainWeeks.monday, plainWeeks.nextSaturday, {
        unitHolidays: [{ startDate: "2026-06-01", endDate: "2026-07-31" }],
        leaves: [{ startDate: "2026-06-01", endDate: "2026-07-31" }],
      }),
    ).toBe(0);
  });

  it("창 밖으로 삐져나간 구간은 걸치는 만큼만 뺀다", () => {
    // 6/1부터 6/17까지 이어진 휴가 중 창 안에 드는 평일은 6/15~6/17 세 날.
    expect(
      count(plainWeeks.monday, plainWeeks.nextSaturday, {
        leaves: [{ startDate: "2026-06-01", endDate: "2026-06-17" }],
      }),
    ).toBe(7);
  });

  it("전역했거나 오늘이 전역일이면 0", () => {
    expect(count(plainWeeks.monday, plainWeeks.monday)).toBe(0);
    expect(count(plainWeeks.nextMonday, plainWeeks.monday)).toBe(0);
  });

  it("마지막으로 세는 날은 전역 전날이다", () => {
    expect(lastDutyDayCandidate("2026-06-19")).toBe("2026-06-18");
    expect(lastDutyDayCandidate("2026-01-01")).toBe("2025-12-31");
  });
});
