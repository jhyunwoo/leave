import { describe, expect, it } from "vitest";
import {
  sanitizeEndpoint,
  sanitizeSentryEvent,
  sanitizeText,
  sanitizeUnknown,
  sanitizeUrl,
} from "../src/lib/observability/sanitize";

describe("observability sanitization", () => {
  it("removes query strings and fragments from URLs", () => {
    expect(
      sanitizeUrl(
        "https://leave.moveto.kr/u/someone?token=secret&code=123456#private",
      ),
    ).toBe("https://leave.moveto.kr/u/someone");
  });

  it("templates user-controlled API path segments", () => {
    expect(
      sanitizeEndpoint(
        "https://api.leave.moveto.kr/units/real-unit-id/calendar?month=2026-08",
      ),
    ).toBe("/units/[param]/calendar");
    expect(
      sanitizeEndpoint(
        "https://api.leave.moveto.kr/leaves/a-real-sensitive-id",
      ),
    ).toBe("/leaves/[param]");
  });

  it("redacts bearer tokens, JWTs, emails, and secret assignments", () => {
    const value = sanitizeText(
      "Authorization: Bearer abc.def.ghi email=user@example.com refresh_token=top-secret",
    );
    expect(value).not.toContain("abc.def.ghi");
    expect(value).not.toContain("user@example.com");
    expect(value).not.toContain("top-secret");
    expect(value).toContain("[Filtered]");
  });

  it("redacts sensitive object fields recursively", () => {
    expect(
      sanitizeUnknown({
        safe: "status",
        authorization: "Bearer secret",
        nested: { refreshToken: "secret", count: 2 },
      }),
    ).toEqual({
      safe: "status",
      authorization: "[Filtered]",
      nested: { refreshToken: "[Filtered]", count: 2 },
    });
  });

  it("drops request bodies, headers, and non-id user context", () => {
    const event = sanitizeSentryEvent({
      request: {
        method: "POST",
        url: "https://api.leave.moveto.kr/leaves?access_token=secret",
        headers: { Authorization: "Bearer secret" },
        data: { reason: "private" },
      },
      user: { id: "internal-user-id", email: "user@example.com" },
    });

    expect(event.request).toEqual({
      method: "POST",
      url: "https://api.leave.moveto.kr/leaves",
    });
    expect(event.user).toEqual({ id: "internal-user-id" });
  });
});
