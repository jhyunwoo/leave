import { describe, expect, it } from "vitest";
import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  WHEEL_ITEM_HEIGHT,
  WHEEL_PAD,
  WHEEL_VISIBLE_ITEMS,
  indexFromScrollTop,
  indexOfOption,
  joinTime,
  moveIndex,
  scrollTopForIndex,
  splitTime,
} from "../src/components/time-wheel";

describe("목록", () => {
  it("시는 00부터 23까지 24칸이다", () => {
    expect(HOUR_OPTIONS).toHaveLength(24);
    expect(HOUR_OPTIONS[0]).toBe("00");
    expect(HOUR_OPTIONS[23]).toBe("23");
  });

  it("분은 1분 단위로 60칸이다 — OS 피커가 1분 단위이기 때문이다", () => {
    expect(MINUTE_OPTIONS).toHaveLength(60);
    expect(MINUTE_OPTIONS[7]).toBe("07");
    expect(MINUTE_OPTIONS[59]).toBe("59");
  });

  it("가운데 칸이 하나로 정해지도록 보이는 칸 수는 홀수다", () => {
    expect(WHEEL_VISIBLE_ITEMS % 2).toBe(1);
    expect(WHEEL_PAD).toBe(((WHEEL_VISIBLE_ITEMS - 1) / 2) * WHEEL_ITEM_HEIGHT);
  });
});

describe("splitTime / joinTime", () => {
  it("값을 시·분으로 나눈다", () => {
    expect(splitTime("21:30")).toEqual({ hour: "21", minute: "30" });
  });

  it("빈 값은 빈 시·분이다", () => {
    expect(splitTime("")).toEqual({ hour: "", minute: "" });
  });

  it("왕복해도 값이 그대로다", () => {
    const { hour, minute } = splitTime("07:05");
    expect(joinTime(hour, minute)).toBe("07:05");
  });
});

describe("indexOfOption", () => {
  it("목록에서 값의 자리를 찾는다", () => {
    expect(indexOfOption(HOUR_OPTIONS, "09")).toBe(9);
    expect(indexOfOption(MINUTE_OPTIONS, "45")).toBe(45);
  });

  it("목록에 없는 값과 빈 값은 첫 칸으로 본다", () => {
    expect(indexOfOption(HOUR_OPTIONS, "")).toBe(0);
    expect(indexOfOption(HOUR_OPTIONS, "99")).toBe(0);
  });
});

describe("스크롤 위치 ↔ 인덱스", () => {
  it("인덱스가 곧 칸 높이의 배수다", () => {
    expect(scrollTopForIndex(0)).toBe(0);
    expect(scrollTopForIndex(9)).toBe(9 * WHEEL_ITEM_HEIGHT);
  });

  it("되돌리면 같은 인덱스가 나온다", () => {
    for (const index of [0, 1, 12, 23]) {
      expect(
        indexFromScrollTop(scrollTopForIndex(index), HOUR_OPTIONS.length),
      ).toBe(index);
    }
  });

  it("칸 사이에 멈춘 위치는 가까운 쪽으로 붙는다", () => {
    expect(indexFromScrollTop(WHEEL_ITEM_HEIGHT * 2.4, 24)).toBe(2);
    expect(indexFromScrollTop(WHEEL_ITEM_HEIGHT * 2.6, 24)).toBe(3);
  });

  it("목록 밖으로 넘치는 위치는 양끝에 붙는다", () => {
    expect(indexFromScrollTop(-40, 24)).toBe(0);
    expect(indexFromScrollTop(WHEEL_ITEM_HEIGHT * 99, 24)).toBe(23);
  });
});

describe("moveIndex", () => {
  it("키보드로 한 칸씩 움직인다", () => {
    expect(moveIndex(9, 1, 24)).toBe(10);
    expect(moveIndex(9, -1, 24)).toBe(8);
    expect(moveIndex(9, 5, 24)).toBe(14);
  });

  it("휠은 돌지 않는다 — 양끝에서 멈춘다", () => {
    expect(moveIndex(0, -1, 24)).toBe(0);
    expect(moveIndex(23, 1, 24)).toBe(23);
    expect(moveIndex(9, -24, 24)).toBe(0);
    expect(moveIndex(9, 24, 24)).toBe(23);
  });
});
