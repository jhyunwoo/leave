import { describe, expect, it } from "vitest";
import { PRODUCTION_API_URL, resolveApiUrl } from "../src";

describe("resolveApiUrl", () => {
  it("빌드에 주입된 주소가 있으면 그대로 쓴다", () => {
    expect(
      resolveApiUrl({
        envUrl: "https://leave-api.moveto.workers.dev",
        devHost: "192.168.0.10",
      }),
    ).toBe("https://leave-api.moveto.workers.dev");
  });

  it("주입된 주소가 없고 개발 서버에 붙어 있으면 그 호스트의 8787", () => {
    expect(resolveApiUrl({ envUrl: undefined, devHost: "192.168.0.10" })).toBe(
      "http://192.168.0.10:8787",
    );
  });

  // OTA 업데이트 번들에는 eas.json 빌드 프로필의 env가 주입되지 않는다.
  // 그때 localhost로 떨어지면 기기가 자기 자신에게 요청해 앱이 무한 로딩에 빠진다.
  it("주입된 주소도 개발 서버도 없으면 프로덕션으로 보낸다", () => {
    const url = resolveApiUrl({ envUrl: undefined, devHost: undefined });
    expect(url).toBe(PRODUCTION_API_URL);
    expect(url).not.toMatch(/localhost/);
  });

  it("빈 문자열·공백은 주입되지 않은 것으로 본다", () => {
    expect(resolveApiUrl({ envUrl: "", devHost: "" })).toBe(PRODUCTION_API_URL);
    expect(resolveApiUrl({ envUrl: "   ", devHost: null })).toBe(
      PRODUCTION_API_URL,
    );
  });

  it("프로덕션 기본값은 https여야 한다 (iOS ATS가 평문 HTTP를 막는다)", () => {
    expect(PRODUCTION_API_URL.startsWith("https://")).toBe(true);
  });
});
