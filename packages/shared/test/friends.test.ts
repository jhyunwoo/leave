import { describe, expect, it } from "vitest";
import {
  canonicalFriendPair,
  friendIdsSchema,
  normalizeEmail,
  normalizeFriendIds,
  personalEventCreateSchema,
} from "../src";

describe("friend helpers", () => {
  it("normalizes exact email matches", () => {
    expect(normalizeEmail("  Friend@Example.COM ")).toBe("friend@example.com");
  });

  it("canonicalizes relationship pairs", () => {
    expect(canonicalFriendPair("z", "a")).toEqual(["a", "z"]);
  });

  it("sorts and deduplicates selections", () => {
    expect(normalizeFriendIds(["b", " a ", "b", ""])).toEqual(["a", "b"]);
  });

  it("enforces the ten-friend boundary after deduplication", () => {
    expect(friendIdsSchema.parse(["a", "a"])).toEqual(["a"]);
    expect(friendIdsSchema.safeParse([]).success).toBe(false);
    expect(
      friendIdsSchema.safeParse(Array.from({ length: 11 }, (_, i) => `u${i}`))
        .success,
    ).toBe(false);
  });
});

describe("personal event schema", () => {
  it("accepts a multi-day local-time event", () => {
    expect(
      personalEventCreateSchema.parse({
        title: "  가족 일정 ",
        startDate: "2026-08-22",
        endDate: "2026-08-24",
        startTime: "09:30",
        endTime: "18:00",
      }).title,
    ).toBe("가족 일정");
  });

  it("rejects reversed dates, invalid time, and reversed same-day time", () => {
    expect(
      personalEventCreateSchema.safeParse({
        title: "일정",
        startDate: "2026-08-24",
        endDate: "2026-08-22",
      }).success,
    ).toBe(false);
    expect(
      personalEventCreateSchema.safeParse({
        title: "일정",
        startDate: "2026-08-22",
        endDate: "2026-08-22",
        startTime: "25:00",
      }).success,
    ).toBe(false);
    expect(
      personalEventCreateSchema.safeParse({
        title: "일정",
        startDate: "2026-08-22",
        endDate: "2026-08-22",
        startTime: "18:00",
        endTime: "09:00",
      }).success,
    ).toBe(false);
  });
});
