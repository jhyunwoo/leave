import { describe, expect, it } from "vitest";
import {
  reorderTargetIndex,
  shiftForIndex,
} from "../src/components/segment-reorder";

// 세 행. 가운데 행만 선택기가 펴져 있어 두 배 높다.
const HEIGHTS = [100, 200, 100];

describe("reorderTargetIndex", () => {
  it("움직이지 않으면 제자리다", () => {
    expect(reorderTargetIndex(HEIGHTS, 0, 0)).toBe(0);
  });

  it("이웃의 절반을 넘어야 자리를 넘겨받는다", () => {
    expect(reorderTargetIndex(HEIGHTS, 0, 99)).toBe(0);
    expect(reorderTargetIndex(HEIGHTS, 0, 100)).toBe(1);
  });

  it("행 높이가 제각각이면 지나온 행의 실제 높이를 깎는다", () => {
    // 0번(100)이 1번(200)을 지나려면 100, 2번(100)까지 가려면 200 + 50.
    expect(reorderTargetIndex(HEIGHTS, 0, 249)).toBe(1);
    expect(reorderTargetIndex(HEIGHTS, 0, 250)).toBe(2);
  });

  it("위로도 같은 규칙이다", () => {
    expect(reorderTargetIndex(HEIGHTS, 2, -99)).toBe(2);
    expect(reorderTargetIndex(HEIGHTS, 2, -100)).toBe(1);
    expect(reorderTargetIndex(HEIGHTS, 2, -250)).toBe(0);
  });

  it("목록 밖으로는 나가지 않는다", () => {
    expect(reorderTargetIndex(HEIGHTS, 0, 100_000)).toBe(2);
    expect(reorderTargetIndex(HEIGHTS, 2, -100_000)).toBe(0);
  });

  it("없는 자리를 잡으면 그대로 돌려준다", () => {
    expect(reorderTargetIndex(HEIGHTS, 5, 100)).toBe(5);
    expect(reorderTargetIndex([], 0, 100)).toBe(0);
  });
});

describe("shiftForIndex", () => {
  it("잡힌 행은 비켜서지 않는다 (자기 이동은 제스처가 그린다)", () => {
    expect(shiftForIndex(0, 0, 2, 100)).toBe(0);
  });

  it("아래로 끌면 지나온 행들이 위로 올라온다", () => {
    expect(shiftForIndex(1, 0, 2, 100)).toBe(-100);
    expect(shiftForIndex(2, 0, 2, 100)).toBe(-100);
  });

  it("위로 끌면 지나온 행들이 아래로 내려간다", () => {
    expect(shiftForIndex(1, 2, 1, 100)).toBe(100);
    expect(shiftForIndex(0, 2, 1, 100)).toBe(0);
  });

  it("지나가지 않은 행은 그대로다", () => {
    expect(shiftForIndex(2, 0, 1, 100)).toBe(0);
  });
});
