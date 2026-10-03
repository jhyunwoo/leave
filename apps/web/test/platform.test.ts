/**
 * 랜딩의 다운로드 버튼을 고르는 기기 판정.
 *
 * 판정이 두 벌이다 — 첫 페인트 전 인라인 스크립트(`FIRST_PAINT_SCRIPT`)와 앱 안에서
 * 넘어왔을 때 쓰는 `storePlatform`. 한쪽만 고치면 같은 기기가 들어온 길에 따라
 * 다른 버튼을 본다. 그래서 인라인 스크립트를 실제로 돌려 둘을 비교한다.
 */

import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { FIRST_PAINT_SCRIPT } from "../src/seo/head";
import { storePlatform } from "../src/seo/platform";

const AGENTS = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
} as const;

/** 인라인 스크립트를 가짜 document·navigator 위에서 돌리고 남긴 표시를 돌려준다. */
function runFirstPaint(
  userAgent: string,
  maxTouchPoints: number,
  storage: { getItem: (key: string) => string | null },
) {
  const attributes: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  };
  // 배포되는 문자열 그대로를 돌려 봐야 두 판정이 같은지 알 수 있다.
  runInNewContext(FIRST_PAINT_SCRIPT, {
    document,
    navigator: { userAgent, maxTouchPoints },
    localStorage: storage,
  });
  return attributes;
}

const emptyStorage = { getItem: () => null };

describe("storePlatform", () => {
  it.each([
    ["iphone", 5, "ios"],
    ["ipadDesktopMode", 5, "ios"],
    ["ipadDesktopMode", 0, null],
    ["android", 5, "android"],
    ["windows", 0, null],
  ] as const)("%s(터치 %d) → %s", (agent, touch, expected) => {
    expect(storePlatform(AGENTS[agent], touch)).toBe(expected);
    expect(
      runFirstPaint(AGENTS[agent], touch, emptyStorage)["data-platform"],
    ).toBe(expected ?? undefined);
  });

  it("localStorage가 던져도 기기 표시는 남긴다", () => {
    const attributes = runFirstPaint(AGENTS.iphone, 5, {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(attributes).toEqual({ "data-platform": "ios" });
  });

  it("세션이 있으면 세션 표시도 남긴다", () => {
    expect(
      runFirstPaint(AGENTS.windows, 0, { getItem: () => "token" }),
    ).toEqual({ "data-session": "1" });
  });
});
