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
