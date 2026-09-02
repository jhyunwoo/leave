import { describe, expect, it } from "vitest";
import {
  HERO_HEAD_DECIMALS,
  SERVICE_PERCENT_DECIMALS,
  percentBetween,
  splitPercentText,
} from "../src/lib/service-progress-format";

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
