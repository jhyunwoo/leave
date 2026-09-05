import { describe, expect, it } from "vitest";
import {
  BRANCHES,
  ONBOARDING_COPY,
  ONBOARDING_HOWTO,
  ONBOARDING_STEP_IDS,
  REGULAR_OVERNIGHT_DEFAULTS,
  onboardingResumeStep,
  onboardingStepIndex,
  onboardingSteps,
  regularOvernightGuidance,
  regularOvernightIntervalForm,
  regularOvernightIntervalPayload,
  type Branch,
} from "../src";

const profile = (branch: Branch) => ({
  profile: { branch },
  username: "hong",
  regularOvernight: null,
  unitId: null,
});

describe("온보딩 단계", () => {
  it("군종과 무관하게 모두 정기외박 단계를 밟는다", () => {
    // 한때 육군만 이 단계를 건너뛰었다 — 육군도 분기마다 외박을 운영한다.
    for (const branch of BRANCHES) {
      expect(onboardingSteps()).toContain("overnight");
      expect(onboardingResumeStep(profile(branch))).toBe("overnight");
    }
  });

  it("주기 설정을 저장한 뒤에는 그룹 단계로 이어진다", () => {
    for (const branch of BRANCHES) {
      expect(
        onboardingResumeStep({
          ...profile(branch),
          regularOvernight: { enabled: false },
        }),
      ).toBe("group");
    }
  });

  it("진행바 위치는 단계 목록의 순서 그대로다", () => {
    expect(onboardingStepIndex("welcome")).toBe(0);
    expect(onboardingStepIndex("overnight")).toBe(
      ONBOARDING_STEP_IDS.indexOf("overnight"),
    );
  });

  it("사용법은 그룹을 정한 뒤, 완료 직전에 온다", () => {
    // 그룹까지 만들어 본 뒤라야 "같은 그룹의 출타 인원"이 무슨 말인지 통한다.
    expect(onboardingStepIndex("howto")).toBe(onboardingStepIndex("group") + 1);
    expect(onboardingStepIndex("done")).toBe(onboardingStepIndex("howto") + 1);
  });

  it("이미 그룹에 들어간 사람도 사용법에서 이어진다", () => {
    // 사용법에는 서버 상태가 없어 "봤는지"를 알 수 없다 — 한 번 더 보는 쪽을 고른다.
    for (const branch of BRANCHES) {
      expect(
        onboardingResumeStep({
          ...profile(branch),
          regularOvernight: { enabled: true },
          unitId: "unit-1",
        }),
      ).toBe("howto");
    }
  });

  it("모든 단계에 제목과 한 줄 설명이 있다", () => {
    // 화면은 ONBOARDING_COPY만 보고 그린다 — 빠진 단계가 있으면 빈 제목이 나간다.
    for (const step of ONBOARDING_STEP_IDS) {
      expect(ONBOARDING_COPY[step].title.length).toBeGreaterThan(0);
      expect(ONBOARDING_COPY[step].lead.length).toBeGreaterThan(0);
    }
  });
});

describe("사용법 카드", () => {
  it("웹과 앱이 같은 문구를 쓰도록 한 벌만 둔다", () => {
    expect(ONBOARDING_HOWTO.length).toBeGreaterThanOrEqual(4);
    const ids = ONBOARDING_HOWTO.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const card of ONBOARDING_HOWTO) {
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.body.length).toBeGreaterThan(0);
    }
  });

  it("달력·출타 인원·잔여·친구를 모두 설명한다", () => {
    // 어느 하나가 빠지면 처음 들어온 사람이 그 화면을 못 찾는다.
    expect(ONBOARDING_HOWTO.map((card) => card.id)).toEqual(
      expect.arrayContaining([
        "calendar",
        "overage",
        "notify",
        "grants",
        "friends",
      ]),
    );
  });
});

describe("군별 정기외박 통상 운영값", () => {
  it("육군은 분기(3개월) 1박 2일, 해·공군은 42일 2박 3일", () => {
    expect(REGULAR_OVERNIGHT_DEFAULTS.army).toEqual({
      intervalDays: null,
      intervalMonths: 3,
      daysPerGrant: 2,
    });
    expect(REGULAR_OVERNIGHT_DEFAULTS.navy).toEqual({
      intervalDays: 42,
      intervalMonths: null,
      daysPerGrant: 3,
    });
    expect(REGULAR_OVERNIGHT_DEFAULTS.air_force).toEqual(
      REGULAR_OVERNIGHT_DEFAULTS.navy,
    );
  });

  it("모든 군종이 안내 문구를 갖는다", () => {
    for (const branch of BRANCHES) {
      expect(regularOvernightGuidance(branch).summary).toContain("외박");
    }
    expect(regularOvernightGuidance("army").summary).toContain("분기");
  });
});

describe("주기 폼 값", () => {
  it("저장된 설정이 없으면 군별 기본 단위를 쓴다", () => {
    expect(regularOvernightIntervalForm("army")).toEqual({
      unit: "month",
      value: 3,
    });
    expect(regularOvernightIntervalForm("navy")).toEqual({
      unit: "day",
      value: 42,
    });
  });

  it("저장된 설정이 있으면 군종이 아니라 그 단위를 따른다", () => {
    // 부대가 달마다 운영하는 육군, 규정과 다르게 일수로 잡은 해군 모두 있을 수 있다.
    expect(
      regularOvernightIntervalForm("army", {
        intervalDays: 60,
        intervalMonths: null,
      }),
    ).toEqual({ unit: "day", value: 60 });
    expect(
      regularOvernightIntervalForm("navy", {
        intervalDays: null,
        intervalMonths: 2,
      }),
    ).toEqual({ unit: "month", value: 2 });
  });

  it("저장 요청은 쓰지 않는 쪽을 반드시 null로 비운다", () => {
    expect(
      regularOvernightIntervalPayload({ unit: "month", value: 3 }),
    ).toEqual({ intervalDays: null, intervalMonths: 3 });
    expect(regularOvernightIntervalPayload({ unit: "day", value: 42 })).toEqual(
      {
        intervalDays: 42,
        intervalMonths: null,
      },
    );
  });
});
