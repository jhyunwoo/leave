import { describe, expect, it } from "vitest";
import { getHoliday, isHoliday } from "../src";

describe("공휴일 기본", () => {
  it("양력 고정 공휴일", () => {
    expect(getHoliday("2025-01-01")).toBe("신정");
    expect(getHoliday("2025-03-01")).toBe("삼일절");
    expect(getHoliday("2025-06-06")).toBe("현충일");
    expect(getHoliday("2025-12-25")).toBe("성탄절");
  });

  it("음력 기준 공휴일(설날·추석 연휴 3일)", () => {
    expect(getHoliday("2024-02-09")).toBe("설날");
    expect(getHoliday("2024-02-10")).toBe("설날");
    expect(getHoliday("2024-02-11")).toBe("설날");
    expect(getHoliday("2024-09-16")).toBe("추석");
    expect(getHoliday("2024-09-17")).toBe("추석");
    expect(getHoliday("2024-09-18")).toBe("추석");
  });

  it("부처님오신날", () => {
    expect(getHoliday("2024-05-15")).toBe("부처님오신날");
  });

  it("공휴일이 아닌 날", () => {
    expect(getHoliday("2025-07-15")).toBeNull();
    expect(isHoliday("2025-07-15")).toBe(false);
    expect(isHoliday("2025-01-01")).toBe(true);
  });
});

describe("대체공휴일", () => {
  it("설날 연휴가 일요일과 겹치면 다음 평일이 대체공휴일 (2024-02-12)", () => {
    // 2024 설날: 2/9(금)·10(토)·11(일) → 2/12(월) 대체
    expect(getHoliday("2024-02-12")).toBe("대체공휴일");
  });

  it("어린이날이 일요일이면 대체 (2024-05-06)", () => {
    // 2024-05-05 일요일
    expect(getHoliday("2024-05-06")).toBe("대체공휴일");
  });

  it("삼일절이 토요일이면 다음 월요일 대체 (2025-03-03)", () => {
    // 2025-03-01 토요일 → 3/3(월)
    expect(getHoliday("2025-03-03")).toBe("대체공휴일");
  });

  it("어린이날과 부처님오신날이 같은 날이면 대체 하나 (2025-05-06)", () => {
    // 2025-05-05 = 어린이날 + 부처님오신날 → 5/6(화) 대체 1개
    expect(getHoliday("2025-05-06")).toBe("대체공휴일");
    expect(getHoliday("2025-05-07")).toBeNull();
  });

  it("추석 연휴가 일요일과 겹치면 대체 (2025-10-08)", () => {
    // 2025 추석: 10/5(일)·6(월)·7(화) → 10/8(수) 대체
    expect(getHoliday("2025-10-05")).toBe("추석");
    expect(getHoliday("2025-10-08")).toBe("대체공휴일");
  });
});

describe("임시공휴일·선거일", () => {
  it("확정 지정일", () => {
    expect(getHoliday("2024-04-10")).toBe("국회의원선거");
    expect(getHoliday("2025-01-27")).toBe("임시공휴일");
    expect(getHoliday("2025-06-03")).toBe("대통령선거");
    expect(getHoliday("2026-06-03")).toBe("지방선거");
  });
});
