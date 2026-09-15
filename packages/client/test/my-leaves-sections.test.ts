/**
 * 내 휴가를 "다가오는 / 지난"으로 가르는 규칙.
 *
 * 경계가 미묘하다 — 오늘 끝나는 휴가는 아직 지나가지 않았고, 오늘 진행 중인 휴가는
 * 시작일이 과거지만 다가오는 쪽이다. 웹과 네이티브가 같은 답을 봐야 한다.
 */

import { describe, expect, it } from "vitest";
import {
  partitionMyLeaves,
  partitionMyLeavesByKind,
} from "../src/my-leaves-sections";
import type { MyLeave } from "../src/types";

const TODAY = "2026-08-16";

function leave(
  id: string,
  startDate: string,
  endDate: string,
  segments?: unknown[],
): MyLeave {
  return {
    id,
    userId: "u1",
    title: "연가 계획",
    startDate,
    endDate,
    reason: null,
    status: "shared",
    segments: segments ?? [{ category: "annual", startDate, endDate, days: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as MyLeave;
}

/** 외출 한 건. 규정상 당일 복귀이므로 구간도 하루다. */
function outing(id: string, date: string): MyLeave {
  return leave(id, date, date, [
    {
      category: "outing",
      outingKind: "weekday",
      startDate: date,
      endDate: date,
      days: 1,
    },
  ]);
}

describe("partitionMyLeaves", () => {
  it("목록이 없으면 두 섹션 모두 빈 배열이다", () => {
    expect(partitionMyLeaves(undefined, TODAY)).toEqual({
      upcoming: [],
      past: [],
    });
  });

  it("종료일이 어제까지면 지난 휴가다", () => {
    const sections = partitionMyLeaves(
      [leave("a", "2026-08-14", "2026-08-15")],
      TODAY,
    );
    expect(sections.past.map((l) => l.id)).toEqual(["a"]);
    expect(sections.upcoming).toEqual([]);
  });

  it("오늘 끝나는 휴가는 아직 지나지 않았다", () => {
    const sections = partitionMyLeaves(
      [leave("a", "2026-08-14", TODAY)],
      TODAY,
    );
    expect(sections.upcoming.map((l) => l.id)).toEqual(["a"]);
    expect(sections.past).toEqual([]);
  });

  it("오늘 진행 중인 휴가는 다가오는 쪽이고 맨 위에 온다", () => {
    const sections = partitionMyLeaves(
      [
        leave("later", "2026-08-20", "2026-08-22"),
        leave("now", "2026-08-15", "2026-08-18"),
      ],
      TODAY,
    );
    expect(sections.upcoming.map((l) => l.id)).toEqual(["now", "later"]);
  });

  it("다가오는 휴가는 시작일이 가까운 순이다", () => {
    const sections = partitionMyLeaves(
      [
        leave("c", "2026-10-01", "2026-10-03"),
        leave("a", "2026-08-20", "2026-08-22"),
        leave("b", "2026-09-01", "2026-09-02"),
      ],
      TODAY,
    );
    expect(sections.upcoming.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("시작일이 같으면 먼저 끝나는 휴가가 위다", () => {
    const sections = partitionMyLeaves(
      [
        leave("long", "2026-08-20", "2026-08-25"),
        leave("short", "2026-08-20", "2026-08-21"),
      ],
      TODAY,
    );
    expect(sections.upcoming.map((l) => l.id)).toEqual(["short", "long"]);
  });

  it("지난 휴가는 최근에 끝난 순이다", () => {
    const sections = partitionMyLeaves(
      [
        leave("old", "2026-05-01", "2026-05-03"),
        leave("recent", "2026-08-10", "2026-08-12"),
        leave("mid", "2026-07-01", "2026-07-02"),
      ],
      TODAY,
    );
    expect(sections.past.map((l) => l.id)).toEqual(["recent", "mid", "old"]);
  });

  it("종료일이 같으면 늦게 시작한 휴가가 위다", () => {
    const sections = partitionMyLeaves(
      [
        leave("long", "2026-08-01", "2026-08-12"),
        leave("short", "2026-08-11", "2026-08-12"),
      ],
      TODAY,
    );
    expect(sections.past.map((l) => l.id)).toEqual(["short", "long"]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const input = [
      leave("b", "2026-09-01", "2026-09-02"),
      leave("a", "2026-08-20", "2026-08-22"),
    ];
    partitionMyLeaves(input, TODAY);
    expect(input.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

/**
 * 휴가와 외출을 가르는 탭.
 *
 * 갈래 판정은 서버와 함께 쓰는 `isOutingSegments`를 그대로 빌린다 — 여기서 확인하는
 * 것은 "그 판정으로 두 갈래를 만들고, 갈래 안의 시간 규칙이 `partitionMyLeaves`와
 * 같은가"다.
 */
describe("partitionMyLeavesByKind", () => {
  it("목록이 없어도 두 갈래가 모두 빈 섹션으로 있다", () => {
    expect(partitionMyLeavesByKind(undefined, TODAY)).toEqual({
      leave: { upcoming: [], past: [] },
      outing: { upcoming: [], past: [] },
    });
  });

  it("갈래마다 다가오는 것과 지난 것을 따로 나눈다", () => {
    const sections = partitionMyLeavesByKind(
      [
        leave("휴가-지난", "2026-08-10", "2026-08-12"),
        leave("휴가-다가옴", "2026-08-20", "2026-08-22"),
        outing("외출-지난", "2026-08-14"),
        outing("외출-다가옴", "2026-08-18"),
      ],
      TODAY,
    );
    expect(sections.leave.upcoming.map((l) => l.id)).toEqual(["휴가-다가옴"]);
    expect(sections.leave.past.map((l) => l.id)).toEqual(["휴가-지난"]);
    expect(sections.outing.upcoming.map((l) => l.id)).toEqual(["외출-다가옴"]);
    expect(sections.outing.past.map((l) => l.id)).toEqual(["외출-지난"]);
  });

  it("한 갈래만 있어도 다른 갈래 키가 사라지지 않는다", () => {
    const sections = partitionMyLeavesByKind(
      [leave("a", "2026-08-20", "2026-08-22")],
      TODAY,
    );
    expect(sections.outing).toEqual({ upcoming: [], past: [] });
  });

  // 외출을 다른 재원과 섞지 못하게 막은 것은 나중에 생긴 규칙이라 옛 행이 남아 있다.
  // `isOutingSegments`가 every를 쓰는 이유이고, 그 답을 여기서도 그대로 따른다.
  it("연가가 섞인 옛 행은 휴가 쪽이다", () => {
    const mixed = leave("옛행", "2026-08-20", "2026-08-21", [
      {
        category: "annual",
        startDate: "2026-08-20",
        endDate: "2026-08-20",
        days: 1,
      },
      {
        category: "outing",
        startDate: "2026-08-21",
        endDate: "2026-08-21",
        days: 1,
      },
    ]);
    const sections = partitionMyLeavesByKind([mixed], TODAY);
    expect(sections.leave.upcoming.map((l) => l.id)).toEqual(["옛행"]);
    expect(sections.outing.upcoming).toEqual([]);
  });

  it("구간이 없는 옛 행도 휴가 쪽이다", () => {
    const sections = partitionMyLeavesByKind(
      [leave("빈행", "2026-08-20", "2026-08-21", [])],
      TODAY,
    );
    expect(sections.leave.upcoming.map((l) => l.id)).toEqual(["빈행"]);
  });

  it("갈래 안의 정렬은 partitionMyLeaves와 같다", () => {
    const leaves = [
      leave("c", "2026-10-01", "2026-10-03"),
      leave("a", "2026-08-20", "2026-08-22"),
      leave("old", "2026-05-01", "2026-05-03"),
      leave("recent", "2026-08-10", "2026-08-12"),
    ];
    expect(partitionMyLeavesByKind(leaves, TODAY).leave).toEqual(
      partitionMyLeaves(leaves, TODAY),
    );
  });
});
