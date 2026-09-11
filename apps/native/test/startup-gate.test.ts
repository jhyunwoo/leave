import { describe, expect, it } from "vitest";
import { resolveStartupGate } from "../src/lib/startup-gate";

const base = {
  sessionReady: true,
  isRestoring: false,
  authenticated: true,
  hasOnboardingData: false,
  onboardingFetchStatus: "fetching" as const,
  onboardingErrored: false,
};

describe("시작 게이트", () => {
  it("세션을 복원하는 동안은 스플래시를 유지한다", () => {
    expect(resolveStartupGate({ ...base, sessionReady: false })).toBe(
      "loading",
    );
  });

  it("디스크 캐시를 복원하는 동안은 '없다'로 단정하지 않는다", () => {
    expect(
      resolveStartupGate({
        ...base,
        isRestoring: true,
        onboardingFetchStatus: "paused",
      }),
    ).toBe("loading");
  });

  it("비로그인은 온보딩 상태를 기다리지 않는다", () => {
    expect(resolveStartupGate({ ...base, authenticated: false })).toBe("ready");
  });

  it("받아 오는 중이면 기다린다", () => {
    expect(resolveStartupGate(base)).toBe("loading");
  });

  /**
   * 이것이 고친 버그다. 오프라인에서 재시도가 멈추면 응답이 영영 오지 않는데,
   * 예전에는 그 상태에서 아무것도 그리지 않아 앱이 빈 화면에 갇혔다.
   */
  it("오프라인으로 재시도가 멈췄고 저장된 상태도 없으면 재시도 화면을 준다", () => {
    expect(
      resolveStartupGate({ ...base, onboardingFetchStatus: "paused" }),
    ).toBe("unreachable");
  });

  it("오프라인이어도 저장된 온보딩 상태가 있으면 앱이 열린다", () => {
    expect(
      resolveStartupGate({
        ...base,
        hasOnboardingData: true,
        onboardingFetchStatus: "paused",
      }),
    ).toBe("ready");
  });

  it("오류로 끝났어도 빈 화면에 머물지 않는다", () => {
    expect(
      resolveStartupGate({
        ...base,
        onboardingErrored: true,
        onboardingFetchStatus: "idle",
      }),
    ).toBe("unreachable");
  });

  it("한 번 받아 둔 상태가 있으면 재조회가 실패해도 화면을 유지한다", () => {
    expect(
      resolveStartupGate({
        ...base,
        hasOnboardingData: true,
        onboardingErrored: true,
        onboardingFetchStatus: "idle",
      }),
    ).toBe("ready");
  });
});
