import { describe, expect, it } from "vitest";
import {
  BRANCHES,
  defaultOutingStartDate,
  firstGrantDate,
  OUTING_DEFAULTS,
  OUTING_KINDS,
  OUTING_SOURCES,
  outingGuidance,
  type OutingConfig,
} from "../src";

describe("군별 외출 기본값", () => {
  it("모든 군 · 모든 갈래에 값이 있다 — 꺼져 있어도 켤 때 쓸 값은 갖고 있어야 한다", () => {
    for (const branch of BRANCHES) {
      for (const kind of OUTING_KINDS) {
        const value = OUTING_DEFAULTS[branch][kind];
        expect(value.intervalMonths).toBeGreaterThanOrEqual(1);
        expect(value.countPerGrant).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("평일 외출은 전 군 월 2회로 켜져 있다", () => {
    for (const branch of BRANCHES) {
      expect(OUTING_DEFAULTS[branch].weekday).toEqual({
        enabled: true,
        intervalMonths: 1,
        countPerGrant: 2,
      });
    }
  });

  it("주말 외출은 육군만 켠다 — 해·공군은 공개 규정에 주기가 없어 기본값을 두지 않는다", () => {
    expect(OUTING_DEFAULTS.army.weekend).toEqual({
      enabled: true,
      intervalMonths: 1,
      countPerGrant: 1,
    });
    expect(OUTING_DEFAULTS.navy.weekend.enabled).toBe(false);
    expect(OUTING_DEFAULTS.air_force.weekend.enabled).toBe(false);
  });

  it("근거 출처가 붙어 있다", () => {
    expect(OUTING_SOURCES.length).toBeGreaterThan(0);
    for (const source of OUTING_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.label.length).toBeGreaterThan(0);
    }
  });
});

describe("안내 문구", () => {
  it("주말 외출을 켜는 군과 아닌 군이 다른 말을 한다", () => {
    expect(outingGuidance("army").summary).toContain("주말 외출 월 1회");
    expect(outingGuidance("navy").summary).toContain("부대마다 달라");
  });

  it("어느 군이든 부대 지침이 우선이라고 고지한다", () => {
    for (const branch of BRANCHES) {
      expect(outingGuidance(branch).disclaimer).toContain("부대 지침");
      expect(outingGuidance(branch).detail.length).toBeGreaterThan(0);
    }
  });
});

describe("기본 주기 시작일", () => {
  it("입대한 달의 1일이다 — 부대가 세는 달과 어긋나지 않게", () => {
    expect(defaultOutingStartDate("2026-03-15")).toBe("2026-03-01");
    expect(defaultOutingStartDate("2026-12-31")).toBe("2026-12-01");
    expect(defaultOutingStartDate("2026-01-01")).toBe("2026-01-01");
  });

  it("첫 적립은 한 주기 뒤라 입대 다음 달 1일이 된다 — 신병교육 중에는 외출이 없다", () => {
    const config: OutingConfig = {
      enabled: true,
      startDate: defaultOutingStartDate("2026-03-15"),
      intervalDays: null,
      intervalMonths: OUTING_DEFAULTS.army.weekday.intervalMonths,
      daysPerGrant: OUTING_DEFAULTS.army.weekday.countPerGrant,
    };
    expect(firstGrantDate(config)).toBe("2026-04-01");
  });
});
