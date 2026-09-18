import { KST_OFFSET_MS, todayInSeoul } from "@leave/shared/dates";
import { describe, expect, it } from "vitest";
import { msUntilNextSeoulMidnight } from "../src/lib/seoul-midnight";

const DAY_MS = 24 * 60 * 60 * 1_000;

/** 한국시간 `date`의 자정에 해당하는 epoch ms. */
function kstMidnightOf(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - KST_OFFSET_MS;
}

describe("msUntilNextSeoulMidnight", () => {
  it("한국시간 자정 정각에서는 하루를 돌려준다", () => {
    // 0을 주면 타이머가 즉시 다시 깨어 같은 날짜를 반복해 읽는다.
    expect(msUntilNextSeoulMidnight(kstMidnightOf("2026-09-18"))).toBe(DAY_MS);
  });

  it("자정 1분 전에는 1분이 남는다", () => {
    const at = kstMidnightOf("2026-09-19") - 60_000;
    expect(msUntilNextSeoulMidnight(at)).toBe(60_000);
  });

  it("기다린 만큼 지나면 한국시간 날짜가 실제로 넘어간다", () => {
    const before = kstMidnightOf("2026-09-19") - 1_000;
    expect(todayInSeoul(new Date(before))).toBe("2026-09-18");
    const after = before + msUntilNextSeoulMidnight(before);
    expect(todayInSeoul(new Date(after))).toBe("2026-09-19");
  });

  it("해가 바뀌는 12월 31일 → 1월 1일에서도 같다", () => {
    const before = kstMidnightOf("2027-01-01") - 1;
    expect(todayInSeoul(new Date(before))).toBe("2026-12-31");
    const after = before + msUntilNextSeoulMidnight(before);
    expect(todayInSeoul(new Date(after))).toBe("2027-01-01");
  });

  it("2월 28일 → 윤년 2월 29일에서도 같다", () => {
    const before = kstMidnightOf("2028-02-29") - 1;
    expect(todayInSeoul(new Date(before))).toBe("2028-02-28");
    const after = before + msUntilNextSeoulMidnight(before);
    expect(todayInSeoul(new Date(after))).toBe("2028-02-29");
  });

  it("언제 불러도 하루 안의 양수다", () => {
    for (let minute = 0; minute < 24 * 60; minute += 37) {
      const at = kstMidnightOf("2026-09-18") + minute * 60_000;
      const remaining = msUntilNextSeoulMidnight(at);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(DAY_MS);
    }
  });
});
