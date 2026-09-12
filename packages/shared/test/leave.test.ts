import { describe, expect, it } from "vitest";
import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  balanceLabel,
  type BalanceKey,
  BALANCE_LEAVE_STATUSES,
  COUNTED_LEAVE_STATUSES,
  LEAVE_STATUSES,
  countsAgainstBalance,
  segmentBalanceKey,
  shiftSegments,
  DEFAULT_ANNUAL_DAYS,
  inclusiveDays,
  isOutingSegments,
  leaveCreateSchema,
} from "../src";

describe("재원 이름", () => {
  it.each(BALANCE_KEYS)("%s의 이름을 돌려준다", (key) => {
    expect(balanceLabel(key)).toBe(BALANCE_LABELS[key]);
  });

  /**
   * 재원이 새로 생기면 서버가 먼저 배포되고, 그 사이 구버전 앱·열려 있던 웹 탭에는
   * 모르는 키가 내려온다. 이름 자리가 빈칸으로 남으면 무슨 칩인지 알 수 없다.
   */
  it("모르는 재원은 기타로 접는다", () => {
    expect(balanceLabel("shore_leave" as BalanceKey)).toBe("기타");
  });
});

describe("휴가 재원", () => {
  it("군별 연가 규정값은 수정 가능한 초기 제안값으로 제공", () => {
    expect(DEFAULT_ANNUAL_DAYS).toEqual({
      army: 24,
      navy: 27,
      air_force: 28,
    });
  });

  it("시작일과 종료일을 모두 포함해 계산", () => {
    expect(inclusiveDays("2026-08-01", "2026-08-05")).toBe(5);
  });

  it("정기외박과 기타 외박 잔여량을 분리", () => {
    expect(
      segmentBalanceKey({
        category: "overnight",
        overnightKind: "regular",
      }),
    ).toBe("regular_overnight");
    expect(
      segmentBalanceKey({
        category: "overnight",
        overnightKind: "other",
      }),
    ).toBe("other_overnight");
  });
});

describe("shiftSegments", () => {
  const segments = [
    { category: "annual", startDate: "2026-08-10", endDate: "2026-08-12" },
    {
      category: "overnight",
      overnightKind: "regular",
      startDate: "2026-08-13",
      endDate: "2026-08-14",
    },
  ] as const;

  it("0일이면 그대로 둔다", () => {
    expect(shiftSegments(segments, 0)).toEqual(segments);
  });

  it("모든 구간을 같은 일수만큼 뒤로 민다", () => {
    expect(shiftSegments(segments, 8)).toEqual([
      { category: "annual", startDate: "2026-08-18", endDate: "2026-08-20" },
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-08-21",
        endDate: "2026-08-22",
      },
    ]);
  });

  it("음수면 앞으로 당긴다", () => {
    expect(shiftSegments(segments, -10)).toEqual([
      { category: "annual", startDate: "2026-07-31", endDate: "2026-08-02" },
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-08-03",
        endDate: "2026-08-04",
      },
    ]);
  });

  it("달·해 경계를 넘어간다", () => {
    expect(
      shiftSegments([{ startDate: "2025-12-30", endDate: "2025-12-31" }], 2),
    ).toEqual([{ startDate: "2026-01-01", endDate: "2026-01-02" }]);
  });

  it("윤년 2월 29일을 지난다", () => {
    expect(
      shiftSegments([{ startDate: "2028-02-28", endDate: "2028-02-28" }], 1),
    ).toEqual([{ startDate: "2028-02-29", endDate: "2028-02-29" }]);
    // 평년이면 같은 이동이 3월로 넘어간다.
    expect(
      shiftSegments([{ startDate: "2027-02-28", endDate: "2027-02-28" }], 1),
    ).toEqual([{ startDate: "2027-03-01", endDate: "2027-03-01" }]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const original = [{ startDate: "2026-08-10", endDate: "2026-08-12" }];
    shiftSegments(original, 5);
    expect(original).toEqual([
      { startDate: "2026-08-10", endDate: "2026-08-12" },
    ]);
  });

  it("옮긴 뒤에도 leaveCreateSchema를 그대로 통과한다", () => {
    // 인접·비중첩이 보존되므로 저장 가능한 상태가 유지되어야 한다.
    const moved = shiftSegments(segments, 40);
    const parsed = leaveCreateSchema.safeParse({
      title: "여름 휴가",
      status: "shared",
      segments: moved,
    });
    expect(parsed.success).toBe(true);
  });

  it("긴 휴가를 옮겨도 전체 기간 상한은 늘어나지 않는다", () => {
    const long = [{ startDate: "2026-01-01", endDate: "2026-12-01" }];
    const moved = shiftSegments(long, 100);
    expect(inclusiveDays(moved[0]!.startDate, moved[0]!.endDate)).toBe(
      inclusiveDays(long[0]!.startDate, long[0]!.endDate),
    );
  });
});

/**
 * 두 상태 집합은 서로 다른 질문에 답한다. 예전에는 서버의 잔여 계산에 상태 조건이
 * 아예 없어서 취소한 휴가가 계속 잔여를 깎았다.
 */
describe("잔여를 깎는 상태", () => {
  it("취소·반려는 잔여를 깎지 않는다", () => {
    expect(countsAgainstBalance("cancelled")).toBe(false);
    expect(countsAgainstBalance("rejected")).toBe(false);
  });

  it("초안은 내가 잡아 둔 계획이라 잔여에서 빠진다", () => {
    expect(countsAgainstBalance("draft")).toBe(true);
    // 반면 그룹 출타 집계에는 들어가지 않는다 — 나만 보는 계획이다.
    expect(COUNTED_LEAVE_STATUSES).not.toContain("draft");
  });

  it("출타 집계에 들어가는 상태는 모두 잔여도 깎는다", () => {
    for (const status of COUNTED_LEAVE_STATUSES) {
      expect(countsAgainstBalance(status)).toBe(true);
    }
  });

  it("두 집합의 차이는 초안·취소·반려 셋뿐이다", () => {
    const balance = new Set<string>(BALANCE_LEAVE_STATUSES);
    const counted = new Set<string>(COUNTED_LEAVE_STATUSES);
    expect(
      LEAVE_STATUSES.filter((s) => balance.has(s) !== counted.has(s)),
    ).toEqual(["draft"]);
    expect(LEAVE_STATUSES.filter((s) => !balance.has(s))).toEqual([
      "rejected",
      "cancelled",
    ]);
  });
});

/**
 * 친구 달력의 `kind`와 앱의 "다음 외출" 카운트다운이 같은 판정을 써야 한다.
 * 한쪽만 고쳐지면 달력에는 외출인데 카운트다운에는 휴가로 잡힌다.
 */
describe("외출 한 건 판정", () => {
  it("구간이 전부 외출일 때만 외출이다", () => {
    expect(isOutingSegments([{ category: "outing" }])).toBe(true);
    expect(
      isOutingSegments([{ category: "outing" }, { category: "outing" }]),
    ).toBe(true);
  });

  // 외출을 다른 재원과 섞지 못하게 막은 것은 나중에 생긴 규칙이라 옛 행이 남아 있다.
  it("연가가 섞인 옛 행은 휴가로 본다", () => {
    expect(
      isOutingSegments([{ category: "annual" }, { category: "outing" }]),
    ).toBe(false);
  });

  it("구간이 없는 행도 휴가로 본다", () => {
    expect(isOutingSegments([])).toBe(false);
  });
});
