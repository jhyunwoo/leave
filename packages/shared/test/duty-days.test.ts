import { describe, expect, it } from "vitest";
import {
  dutyDaysBetween,
  lastDutyDayCandidate,
  remainingDutyDays,
} from "../src";

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

describe("구간 일과일", () => {
  function between(
    from: string,
    through: string,
    extra: {
      unitHolidays?: { startDate: string; endDate: string }[];
      leaves?: { startDate: string; endDate: string }[];
    } = {},
  ) {
    return dutyDaysBetween({
      from,
      through,
      unitHolidays: extra.unitHolidays ?? [],
      leaves: extra.leaves ?? [],
    });
  }

  it("끝나는 날을 포함해서 센다", () => {
    // 6/15(월)~6/19(금) 다섯 날 전부. `remainingDutyDays`와 달리 끝을 빼지 않는다.
    expect(between(plainWeeks.monday, plainWeeks.friday)).toBe(5);
    expect(between(plainWeeks.monday, plainWeeks.monday)).toBe(1);
  });

  it("끝이 시작보다 이르면 0", () => {
    expect(between(plainWeeks.nextMonday, plainWeeks.monday)).toBe(0);
  });

  it("남은 일과일과 같은 규칙으로 뺀다", () => {
    // 주말·공휴일·부대 휴일·휴가 — 네 가지를 한 번에.
    expect(
      between("2026-06-15", "2026-06-26", {
        unitHolidays: [{ startDate: "2026-06-17", endDate: "2026-06-18" }],
        leaves: [{ startDate: "2026-06-22", endDate: "2026-06-23" }],
      }),
    ).toBe(6);
    // 2026-03-02는 삼일절 대체공휴일이다.
    expect(between("2026-03-02", "2026-03-02")).toBe(0);
  });

  it("남은 일과일 = 오늘부터 전역 전날까지의 구간 일과일", () => {
    // 위젯이 미래 날짜의 일과일을 이 항등식에서 뺄셈으로 끌어낸다.
    const args = {
      unitHolidays: [{ startDate: "2026-06-17", endDate: "2026-06-18" }],
      leaves: [{ startDate: "2026-06-22", endDate: "2026-06-23" }],
    };
    expect(count(plainWeeks.monday, plainWeeks.nextSaturday, args)).toBe(
      between(
        plainWeeks.monday,
        lastDutyDayCandidate(plainWeeks.nextSaturday),
        args,
      ),
    );
  });
});
