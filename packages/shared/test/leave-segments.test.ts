import { describe, expect, it } from "vitest";
import {
  leaveCreateSchema,
  segmentOnDate,
  segmentsRange,
  type LeaveSegment,
} from "../src";

const segments: LeaveSegment[] = [
  {
    category: "annual",
    startDate: "2026-08-02",
    endDate: "2026-08-05",
    days: 4,
  },
  {
    category: "overnight",
    overnightKind: "regular",
    startDate: "2026-08-06",
    endDate: "2026-08-09",
    days: 4,
  },
];

describe("휴가 구간", () => {
  it("날짜로 그날의 재원을 찾는다", () => {
    expect(segmentOnDate(segments, "2026-08-03")?.category).toBe("annual");
    expect(segmentOnDate(segments, "2026-08-06")?.overnightKind).toBe(
      "regular",
    );
    expect(segmentOnDate(segments, "2026-08-10")).toBeUndefined();
  });

  it("전체 기간은 구간에서 파생된다", () => {
    expect(segmentsRange(segments)).toEqual({
      startDate: "2026-08-02",
      endDate: "2026-08-09",
    });
    expect(segmentsRange([])).toBe(null);
  });
});

describe("휴가 등록 검증", () => {
  const base = { title: "휴가" };

  it("빈틈 없이 이어진 구간은 통과", () => {
    const parsed = leaveCreateSchema.safeParse({
      ...base,
      segments: segments.map(({ days: _days, ...rest }) => rest),
    });
    expect(parsed.success).toBe(true);
  });

  it("구간 사이에 빈 날이 있으면 거부", () => {
    const parsed = leaveCreateSchema.safeParse({
      ...base,
      segments: [
        { category: "annual", startDate: "2026-09-01", endDate: "2026-09-02" },
        { category: "annual", startDate: "2026-09-04", endDate: "2026-09-05" },
      ],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/빈 날/);
  });

  it("구간이 겹치면 거부", () => {
    const parsed = leaveCreateSchema.safeParse({
      ...base,
      segments: [
        { category: "annual", startDate: "2026-09-01", endDate: "2026-09-03" },
        { category: "annual", startDate: "2026-09-03", endDate: "2026-09-05" },
      ],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/겹칠/);
  });

  it("외박은 종류가 필요하다", () => {
    const parsed = leaveCreateSchema.safeParse({
      ...base,
      segments: [
        {
          category: "overnight",
          startDate: "2026-09-01",
          endDate: "2026-09-01",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
