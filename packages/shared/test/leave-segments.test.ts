import { describe, expect, it } from "vitest";
import {
  allocationsToSegments,
  leaveCreateSchema,
  segmentOnDate,
  segmentsRange,
  segmentsToAllocations,
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

  it("구간을 재원별 합계로 접는다", () => {
    expect(segmentsToAllocations(segments)).toEqual([
      { category: "annual", days: 4 },
      { category: "overnight", days: 4, overnightKind: "regular" },
    ]);
  });

  it("같은 재원이 여러 번 나오면 합쳐서 센다", () => {
    const sandwich: LeaveSegment[] = [
      {
        category: "annual",
        startDate: "2026-10-01",
        endDate: "2026-10-01",
        days: 1,
      },
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        days: 1,
      },
      {
        category: "annual",
        startDate: "2026-10-03",
        endDate: "2026-10-03",
        days: 1,
      },
    ];
    expect(segmentsToAllocations(sandwich)).toEqual([
      { category: "annual", days: 2 },
      { category: "overnight", days: 1, overnightKind: "regular" },
    ]);
  });

  it("전체 기간은 구간에서 파생된다", () => {
    expect(segmentsRange(segments)).toEqual({
      startDate: "2026-08-02",
      endDate: "2026-08-09",
    });
    expect(segmentsRange([])).toBe(null);
  });

  it("재원별 일수만 있는 옛 형식을 BALANCE_KEYS 순서로 편다", () => {
    expect(
      allocationsToSegments("2026-08-02", [
        { category: "overnight", days: 4, overnightKind: "regular" },
        { category: "annual", days: 4 },
      ]),
    ).toEqual(segments);
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

  it("구간을 모르는 구버전 요청은 구간으로 변환한다", () => {
    const parsed = leaveCreateSchema.safeParse({
      ...base,
      startDate: "2026-08-02",
      endDate: "2026-08-09",
      allocations: [
        { category: "overnight", days: 4, overnightKind: "regular" },
        { category: "annual", days: 4 },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.segments).toEqual(
      segments.map(({ days: _days, ...rest }) => rest),
    );
  });

  it("구버전 요청도 기간과 재원 합계가 맞아야 한다", () => {
    const parsed = leaveCreateSchema.safeParse({
      ...base,
      startDate: "2026-08-02",
      endDate: "2026-08-09",
      allocations: [{ category: "annual", days: 3 }],
    });
    expect(parsed.success).toBe(false);
  });
});
