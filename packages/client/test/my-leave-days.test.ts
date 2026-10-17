/**
 * 내 휴가를 "날짜 → 그날의 재원"으로 펼치는 규칙.
 *
 * 웹·네이티브 달력이 셀마다 이 맵만 본다. 구간 경계(칩을 이어 그리는 기준)와
 * 확정/초안 구분이 틀리면 희망 일정이 확정처럼 보이거나 칩이 끊겨 그려진다.
 */

import { describe, expect, it } from "vitest";
import { balanceCountedSegments } from "../src/balance-segments";
import { buildMyLeaveDayMap } from "../src/my-leave-days";
import type { MyLeave } from "../src/types";

function leave(
  id: string,
  status: string,
  segments: { startDate: string; endDate: string; [key: string]: unknown }[],
): MyLeave {
  return {
    id,
    userId: "u1",
    title: `${id} 제목`,
    startDate: segments[0]!.startDate,
    endDate: segments.at(-1)!.endDate,
    reason: null,
    status,
    segments: segments.map((segment) => ({
      category: "annual",
      days: 1,
      ...segment,
    })),
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as MyLeave;
}

describe("buildMyLeaveDayMap", () => {
  it("휴가가 없으면 빈 맵이다", () => {
    expect(buildMyLeaveDayMap(undefined).size).toBe(0);
  });

  it("구간마다 첫날·마지막날을 따로 표시하고 재원을 구간별로 정한다", () => {
    const map = buildMyLeaveDayMap([
      leave("a", "approved", [
        { startDate: "2026-09-01", endDate: "2026-09-02" },
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: "2026-09-03",
          endDate: "2026-09-04",
        },
      ]),
    ]);

    expect([...map.keys()]).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
    expect(map.get("2026-09-02")).toMatchObject({
      key: "annual",
      isSegmentStart: false,
      isSegmentEnd: true,
    });
    expect(map.get("2026-09-03")).toMatchObject({
      leaveId: "a",
      key: "regular_overnight",
      isSegmentStart: true,
      isSegmentEnd: false,
    });
  });

  it("하루짜리 구간은 첫날이자 마지막날이다", () => {
    const day = buildMyLeaveDayMap([
      leave("a", "shared", [
        { startDate: "2026-09-01", endDate: "2026-09-01" },
      ]),
    ]).get("2026-09-01");
    expect(day).toMatchObject({ isSegmentStart: true, isSegmentEnd: true });
  });

  it("승인·복귀완료만 확정이고, 초안은 따로 표시한다", () => {
    const flags = (status: string) => {
      const day = buildMyLeaveDayMap([
        leave("a", status, [
          { startDate: "2026-09-01", endDate: "2026-09-01" },
        ]),
      ]).get("2026-09-01")!;
      return { isConfirmed: day.isConfirmed, isDraft: day.isDraft };
    };
    expect(flags("approved")).toEqual({ isConfirmed: true, isDraft: false });
    expect(flags("completed")).toEqual({ isConfirmed: true, isDraft: false });
    expect(flags("requested")).toEqual({ isConfirmed: false, isDraft: false });
    expect(flags("draft")).toEqual({ isConfirmed: false, isDraft: true });
  });
});

describe("balanceCountedSegments", () => {
  const leaves = [
    leave("draft", "draft", [
      { startDate: "2026-09-01", endDate: "2026-09-01" },
    ]),
    leave("approved", "approved", [
      { startDate: "2026-09-02", endDate: "2026-09-02" },
    ]),
    leave("cancelled", "cancelled", [
      { startDate: "2026-09-03", endDate: "2026-09-03" },
    ]),
    leave("rejected", "rejected", [
      { startDate: "2026-09-04", endDate: "2026-09-04" },
    ]),
  ];

  it("서버 잔여 계산과 같이 취소·반려만 빼고 초안은 센다", () => {
    expect(
      balanceCountedSegments(leaves).map((segment) => segment.startDate),
    ).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("수정 중인 휴가는 자기 자신과 부딪히지 않게 뺀다", () => {
    expect(
      balanceCountedSegments(leaves, { excludeLeaveId: "approved" }).map(
        (segment) => segment.startDate,
      ),
    ).toEqual(["2026-09-01"]);
  });
});
