import { describe, expect, it } from "vitest";
import {
  allocationBalanceKey,
  DEFAULT_ANNUAL_DAYS,
  inclusiveDays,
} from "../src";

describe("휴가 재원", () => {
  it("군별 연가 규정값은 수정 가능한 초기 제안값으로 제공", () => {
    expect(DEFAULT_ANNUAL_DAYS).toEqual({
      army: 24,
      navy: 27,
      air_force: 28,
    });
  });

  it("시작일과 종료일을 모두 포함해 계산", () => {
    expect(inclusiveDays("2026-08-01", "2026-08-05")).toBe(5);
  });

  it("정기외박과 기타 외박 잔여량을 분리", () => {
    expect(
      allocationBalanceKey({
        category: "overnight",
        overnightKind: "regular",
      }),
    ).toBe("regular_overnight");
    expect(
      allocationBalanceKey({
        category: "overnight",
        overnightKind: "other",
      }),
    ).toBe("other_overnight");
  });
});
