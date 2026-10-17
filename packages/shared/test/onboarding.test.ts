import { describe, expect, it } from "vitest";
import {
  BRANCHES,
  ONBOARDING_GROUP_VS_FRIENDS,
  ONBOARDING_STEP_IDS,
  onboardingResumeStep,
  onboardingStepIndex,
  isRegularOvernightIntervalValid,
  onboardingSteps,
  regularOvernightFirstGrantPreview,
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
});

describe("공유 그룹과 친구 비교", () => {
  it("친구 설명이 초대코드와 다른 기능임을 밝힌다", () => {
    // 초대코드로 부대원을 부르는 것을 친구 추가로 오해하는 사용자가 많았다.
    const friends = ONBOARDING_GROUP_VS_FRIENDS.find(
      (card) => card.id === "friends",
    );
    expect(friends?.body).toContain("@아이디");
    expect(friends?.body).toContain("초대코드");
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

  it("입력 범위는 단위마다 다르다 — 서버 스키마와 같은 경계", () => {
    expect(isRegularOvernightIntervalValid({ unit: "day", value: 365 })).toBe(
      true,
    );
    expect(isRegularOvernightIntervalValid({ unit: "day", value: 366 })).toBe(
      false,
    );
    expect(isRegularOvernightIntervalValid({ unit: "month", value: 12 })).toBe(
      true,
    );
    expect(isRegularOvernightIntervalValid({ unit: "month", value: 13 })).toBe(
      false,
    );
    expect(isRegularOvernightIntervalValid({ unit: "day", value: 0 })).toBe(
      false,
    );
    // 입력칸이 비거나 소수를 받으면 NaN·소수가 들어온다.
    expect(isRegularOvernightIntervalValid({ unit: "day", value: NaN })).toBe(
      false,
    );
    expect(isRegularOvernightIntervalValid({ unit: "day", value: 1.5 })).toBe(
      false,
    );
  });

  it("첫 적립일 미리보기는 실제 주기 계산을 따른다 — 달 단위를 일수로 근사하지 않는다", () => {
    expect(
      regularOvernightFirstGrantPreview("2026-04-24", {
        unit: "day",
        value: 42,
      }),
    ).toBe("2026-06-05");
    // 1/31 + 3개월은 91일 뒤(5/2)가 아니라 짧은 달 말일로 접힌 4/30이다.
    expect(
      regularOvernightFirstGrantPreview("2026-01-31", {
        unit: "month",
        value: 3,
      }),
    ).toBe("2026-04-30");
  });

  it("기준일이나 주기가 덜 찼으면 미리보기를 내지 않는다", () => {
    const form = { unit: "day", value: 42 } as const;
    expect(regularOvernightFirstGrantPreview("", form)).toBeNull();
    expect(regularOvernightFirstGrantPreview("2026-02-30", form)).toBeNull();
    expect(
      regularOvernightFirstGrantPreview("2026-04-24", {
        unit: "day",
        value: 0,
      }),
    ).toBeNull();
  });
});
