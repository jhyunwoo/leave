import { describe, expect, it } from "vitest";
import { dateToTime, timeToDate } from "../src/components/time-value";

describe("timeToDate", () => {
  it("시·분을 그대로 옮긴다", () => {
    const date = timeToDate("21:30", "09:00");
    expect(date.getHours()).toBe(21);
    expect(date.getMinutes()).toBe(30);
  });

  it("값이 비면 기본 시각을 쓴다", () => {
    expect(dateToTime(timeToDate("", "18:00"))).toBe("18:00");
  });

  it("형식이 어긋난 값도 기본 시각으로 떨어진다", () => {
    expect(dateToTime(timeToDate("25:99", "07:05"))).toBe("07:05");
    expect(dateToTime(timeToDate("9:5", "07:05"))).toBe("07:05");
  });

  it("기본 시각까지 어긋나면 자정이 된다", () => {
    expect(dateToTime(timeToDate("", "없음"))).toBe("00:00");
  });

  it("서머타임 전환을 만나지 않는 고정된 날에 시각을 얹는다", () => {
    const date = timeToDate("02:30", "09:00");
    expect(date.getFullYear()).toBe(2000);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
    // 전환일에 만들면 03:30으로 밀릴 수 있는 시각이다.
    expect(dateToTime(date)).toBe("02:30");
  });
});

describe("dateToTime", () => {
  it("두 자리로 채운다", () => {
    expect(dateToTime(new Date(2000, 0, 1, 7, 5))).toBe("07:05");
    expect(dateToTime(new Date(2000, 0, 1, 0, 0))).toBe("00:00");
    expect(dateToTime(new Date(2000, 0, 1, 23, 59))).toBe("23:59");
  });

  it("왕복해도 값이 그대로다", () => {
    for (const value of ["00:00", "09:07", "12:34", "21:00", "23:59"]) {
      expect(dateToTime(timeToDate(value, "09:00"))).toBe(value);
    }
  });
});
