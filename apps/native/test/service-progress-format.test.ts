import { describe, expect, it } from "vitest";
import {
  HERO_HEAD_DECIMALS,
  SERVICE_PERCENT_DECIMALS,
  ZOOM_DECIMAL_PLACE,
  percentBetween,
  splitPercentText,
  zoomFraction,
  zoomSweepSeconds,
} from "../src/lib/service-progress-format";

// 육군 18개월(547.5일)을 밀리초로. 화면의 기본 기준이라 여기서도 이 값으로 잰다.
const ARMY_SPAN_MS = 547.5 * 24 * 60 * 60 * 1000;

describe("percentBetween", () => {
  it("입대 전은 0, 전역 후는 100으로 자른다", () => {
    expect(percentBetween(1000, 100, 500)).toBe(0);
    expect(percentBetween(1000, 100, 9999)).toBe(100);
  });

  it("가운데는 비율 그대로다", () => {
    expect(percentBetween(1000, 100, 1025)).toBe(25);
  });

  it("전역일이 입대일과 같거나 앞서면 0이다", () => {
    // span은 호출부에서 `end > start ? end - start : 0`으로 접혀 들어온다.
    expect(percentBetween(1000, 0, 5000)).toBe(0);
    expect(percentBetween(1000, -100, 5000)).toBe(0);
  });
});

describe("splitPercentText", () => {
  it("정수부 자릿수가 달라져도 소수점을 찾아 자른다", () => {
    // 0% / 43% / 100% — 정수부가 1·2·3자리다. 고정 위치로 자르면 여기서 깨진다.
    expect(splitPercentText("0.0000000000", 2)).toEqual({
      head: "0.00",
      tail: "00000000",
    });
    expect(splitPercentText("43.1234567890", 2)).toEqual({
      head: "43.12",
      tail: "34567890",
    });
    expect(splitPercentText("100.0000000000", 2)).toEqual({
      head: "100.00",
      tail: "00000000",
    });
  });

  it("두 조각을 이으면 원본이 된다", () => {
    for (const value of [0, 1e-9, 12.5, 43.123456789, 99.9999999999, 100]) {
      const text = value.toFixed(SERVICE_PERCENT_DECIMALS);
      const { head, tail } = splitPercentText(text, HERO_HEAD_DECIMALS);
      expect(head + tail).toBe(text);
    }
  });

  it("꼬리 길이는 항상 남은 자릿수만큼이다", () => {
    const text = (43.1234567891).toFixed(SERVICE_PERCENT_DECIMALS);
    const { tail } = splitPercentText(text, HERO_HEAD_DECIMALS);
    expect(tail).toHaveLength(SERVICE_PERCENT_DECIMALS - HERO_HEAD_DECIMALS);
  });

  it("소수점이 없으면 통째로 머리에 둔다", () => {
    expect(splitPercentText("43", 2)).toEqual({ head: "43", tail: "" });
  });
});

describe("zoomFraction", () => {
  it("항상 0 이상 1 미만이다", () => {
    for (const percent of [0, 0.1, 43.1234567891, 99.9999999999, 100]) {
      const fraction = zoomFraction(percent, ZOOM_DECIMAL_PLACE);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
    }
  });

  it("그 자리가 한 칸 오르면 정확히 한 바퀴 돈다", () => {
    const step = Math.pow(10, -ZOOM_DECIMAL_PLACE);
    const before = zoomFraction(43.5, ZOOM_DECIMAL_PLACE);
    const after = zoomFraction(43.5 + step, ZOOM_DECIMAL_PLACE);
    expect(after).toBeCloseTo(before, 8);
  });

  it("한 칸의 절반이면 절반만 찬다", () => {
    const half = Math.pow(10, -ZOOM_DECIMAL_PLACE) / 2;
    expect(zoomFraction(43.5 + half, ZOOM_DECIMAL_PLACE)).toBeCloseTo(0.5, 8);
  });

  it("유한하지 않은 값은 0으로 접는다", () => {
    expect(zoomFraction(Number.NaN, ZOOM_DECIMAL_PLACE)).toBe(0);
    expect(zoomFraction(Number.POSITIVE_INFINITY, ZOOM_DECIMAL_PLACE)).toBe(0);
  });
});

describe("zoomSweepSeconds", () => {
  it("육군 18개월이면 한 바퀴가 5초 안쪽이다", () => {
    const sweep = zoomSweepSeconds(ARMY_SPAN_MS, ZOOM_DECIMAL_PLACE);
    // 눈으로 따라갈 수 있으면서 잔상이 되지 않는 구간. 이 범위를 벗어나면
    // ZOOM_DECIMAL_PLACE를 잘못 고른 것이다.
    expect(sweep).toBeGreaterThan(1);
    expect(sweep).toBeLessThan(10);
    expect(sweep).toBeCloseTo(4.73, 2);
  });

  it("복무 기간이 길수록 느리게 돈다", () => {
    const army = zoomSweepSeconds(ARMY_SPAN_MS, ZOOM_DECIMAL_PLACE);
    const navy = zoomSweepSeconds(ARMY_SPAN_MS * 1.1, ZOOM_DECIMAL_PLACE);
    expect(navy).toBeGreaterThan(army);
  });

  it("복무 기간이 없으면 0이다", () => {
    expect(zoomSweepSeconds(0, ZOOM_DECIMAL_PLACE)).toBe(0);
  });
});
