import { describe, expect, it } from "vitest";
import { settledMonthOffset } from "../src/components/month-window";

describe("두 손가락 달력 이동 종료", () => {
  it("화면에 두 달이 걸쳐 있어도 휴가를 놓은 달로 이동한다", () => {
    expect(settledMonthOffset(1499, 600, 6, 3)).toEqual({
      index: 3,
      offset: 1800,
    });
    expect(settledMonthOffset(1799, 600, 6, 2)).toEqual({
      index: 2,
      offset: 1200,
    });
  });
  it("프로그램 스크롤 위치를 가장 가까운 월 경계로 고정한다", () => {
    expect(settledMonthOffset(1499, 600, 4)).toEqual({
      index: 2,
      offset: 1200,
    });
    expect(settledMonthOffset(1799, 600, 4)).toEqual({
      index: 3,
      offset: 1800,
    });
  });

  it("목록 양끝을 벗어나지 않는다", () => {
    expect(settledMonthOffset(-20, 600, 4).offset).toBe(0);
    expect(settledMonthOffset(9999, 600, 4).offset).toBe(1800);
  });
});
