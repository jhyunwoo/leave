import { describe, expect, it } from "vitest";
import {
  classifyHttpStatus,
  shouldReportTransportFailure,
} from "../src/lib/observability/classification";

describe("observability network classification", () => {
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "keeps expected HTTP %s failures as breadcrumbs",
    (status) => expect(classifyHttpStatus(status)).toBe("breadcrumb"),
  );

  it.each([408, 500, 502, 503])(
    "reports unexpected HTTP %s failures",
    (status) => expect(classifyHttpStatus(status)).toBe("report"),
  );

  it("suppresses transport issues while the device is known offline", () => {
    expect(
      shouldReportTransportFailure(new TypeError("Failed to fetch"), false),
    ).toBe(false);
  });

  /**
   * 앱이 앞에서 내려가는 순간 OS가 열려 있던 연결을 끊는다. NetInfo는 그때도
   * online이라 말하므로 이 신호가 없으면 정상 동작이 계속 이슈로 올라온다.
   */
  it("suppresses transport issues when the app left the foreground mid-request", () => {
    const lost = new Error("The network connection was lost.");

    expect(shouldReportTransportFailure(lost, true, true)).toBe(false);
    expect(shouldReportTransportFailure(lost, true, false)).toBe(true);
  });

  it("suppresses intentional cancellation and reports unexpected online failures", () => {
    expect(
      shouldReportTransportFailure(
        Object.assign(new Error("Aborted"), { name: "AbortError" }),
        true,
      ),
    ).toBe(false);
    expect(
      shouldReportTransportFailure(new TypeError("Failed to fetch"), true),
    ).toBe(true);
  });
});
