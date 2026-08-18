/**
 * 내 휴가를 "다가오는 / 지난"으로 가르는 규칙.
 *
 * 경계가 미묘하다 — 오늘 끝나는 휴가는 아직 지나가지 않았고, 오늘 진행 중인 휴가는
 * 시작일이 과거지만 다가오는 쪽이다. 웹과 네이티브가 같은 답을 봐야 한다.
 */

import { describe, expect, it } from "vitest";
import { partitionMyLeaves } from "../src/my-leaves-sections";
import type { MyLeave } from "../src/types";

const TODAY = "2026-08-16";

function leave(id: string, startDate: string, endDate: string): MyLeave {
  return {
    id,
    userId: "u1",
    title: "연가 계획",
    startDate,
    endDate,
    reason: null,
    status: "shared",
    segments: [{ category: "annual", startDate, endDate, days: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as MyLeave;
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
