import { ApiError } from "@leave/shared";
import { describe, expect, it } from "vitest";
import { shouldRetryQuery } from "../src/query-policy";

describe("query retry policy", () => {
  it.each([400, 401, 403, 404, 422])(
    "does not retry deterministic HTTP %s responses",
    (status) => {
      expect(shouldRetryQuery(0, new ApiError("client error", status))).toBe(
        false,
      );
    },
  );

  it.each([408, 429, 500, 503])(
    "retries transient HTTP %s responses at most twice",
    (status) => {
      const error = new ApiError("transient", status);
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(1, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(false);
    },
  );

  it("keeps bounded retries for network failures", () => {
    const error = new TypeError("Failed to fetch");
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(false);
  });
});
