import { describe, expect, it } from "vitest";
import {
  appendDraft,
  draftDaysByKey,
  draftsEndDate,
  draftsToSegments,
  fitDraftsToTotal,
  removeDraft,
  reorderDrafts,
  resolveDrafts,
  segmentsToDrafts,
  setDraftDays,
  totalDraftDays,
  type SegmentDraft,
} from "../src";

const START = "2026-08-02";

describe("휴가 구간 초안 — 개수 모델", () => {
  it("개수에서 각 구간의 시작·종료일을 파생한다", () => {
    // 스크린샷의 예시: 8/2부터 연가 4개 + 정기외박 4개.
    const drafts: SegmentDraft[] = [
      { key: "annual", days: 4 },
      { key: "regular_overnight", days: 4 },
    ];
    expect(resolveDrafts(START, drafts)).toEqual([
      {
        key: "annual",
        days: 4,
        startDate: "2026-08-02",
        endDate: "2026-08-05",
      },
      {
        key: "regular_overnight",
        days: 4,
        startDate: "2026-08-06",
        endDate: "2026-08-09",
      },
    ]);
  });

  it("시작일이 없으면 파생할 것이 없다", () => {
    expect(resolveDrafts("", [{ key: "annual", days: 4 }])).toEqual([]);
    expect(draftsEndDate("", [{ key: "annual", days: 4 }])).toBe("");
  });

  it("전체 종료일은 개수의 합에서 나온다", () => {
    const drafts: SegmentDraft[] = [
      { key: "annual", days: 4 },
      { key: "award", days: 1 },
    ];
    expect(totalDraftDays(drafts)).toBe(5);
    expect(draftsEndDate(START, drafts)).toBe("2026-08-06");
  });

  it("하루짜리 휴가는 시작일과 종료일이 같다", () => {
    expect(draftsEndDate(START, [{ key: "annual", days: 1 }])).toBe(START);
  });

  it("개수가 없으면 합도 종료일도 없다", () => {
    expect(totalDraftDays([])).toBe(0);
    expect(draftsEndDate(START, [])).toBe("");
  });
});

describe("구간 개수 편집", () => {
  const drafts: SegmentDraft[] = [
    { key: "annual", days: 4 },
    { key: "regular_overnight", days: 4 },
  ];

  it("한 구간의 개수를 바꾸면 뒤 구간이 그대로 밀린다", () => {
    const next = setDraftDays(drafts, 0, 2);
    expect(next).toEqual([
      { key: "annual", days: 2 },
      { key: "regular_overnight", days: 4 },
    ]);
    expect(resolveDrafts(START, next)).toMatchObject([
      { startDate: "2026-08-02", endDate: "2026-08-03" },
      { startDate: "2026-08-04", endDate: "2026-08-07" },
    ]);
  });

  it("마지막 구간도 자유롭게 바꾼다 — 총 기간이 파생값이라 고정할 이유가 없다", () => {
    expect(setDraftDays(drafts, 1, 10)).toEqual([
      { key: "annual", days: 4 },
      { key: "regular_overnight", days: 10 },
    ]);
  });

  it("개수는 1 미만으로 내려가지 않고 정수로 자른다", () => {
    expect(setDraftDays(drafts, 0, 0)[0]).toEqual({ key: "annual", days: 1 });
    expect(setDraftDays(drafts, 0, -3)[0]).toEqual({ key: "annual", days: 1 });
    expect(setDraftDays(drafts, 0, 2.7)[0]).toEqual({ key: "annual", days: 2 });
  });

  it("없는 자리를 가리키면 아무것도 바꾸지 않는다", () => {
    expect(setDraftDays(drafts, 9, 3)).toEqual(drafts);
  });

  it("종류를 더하면 기본 1개로 붙고 총 기간이 그만큼 늘어난다", () => {
    const next = appendDraft(drafts, "award");
    expect(next).toEqual([...drafts, { key: "award", days: 1 }]);
    expect(totalDraftDays(next)).toBe(9);
  });

  it("구간을 지우면 총 기간이 그만큼 줄어든다", () => {
    expect(removeDraft(drafts, 0)).toEqual([
      { key: "regular_overnight", days: 4 },
    ]);
    expect(totalDraftDays(removeDraft(drafts, 0))).toBe(4);
  });

  it("구간이 하나뿐이면 지우지 않는다", () => {
    const single: SegmentDraft[] = [{ key: "annual", days: 3 }];
    expect(removeDraft(single, 0)).toEqual(single);
  });
});

describe("구간 순서 바꾸기", () => {
  const drafts: SegmentDraft[] = [
    { key: "annual", days: 4 },
    { key: "regular_overnight", days: 2 },
    { key: "award", days: 1 },
  ];

  it("뒤로 옮긴다", () => {
    expect(reorderDrafts(drafts, 0, 2)).toEqual([
      { key: "regular_overnight", days: 2 },
      { key: "award", days: 1 },
      { key: "annual", days: 4 },
    ]);
  });

  it("앞으로 옮긴다", () => {
    expect(reorderDrafts(drafts, 2, 0)).toEqual([
      { key: "award", days: 1 },
      { key: "annual", days: 4 },
      { key: "regular_overnight", days: 2 },
    ]);
  });

  it("순서가 바뀌어도 총 기간은 그대로고 날짜만 다시 배치된다", () => {
    const moved = reorderDrafts(drafts, 2, 0);
    expect(totalDraftDays(moved)).toBe(totalDraftDays(drafts));
    expect(resolveDrafts(START, moved)).toMatchObject([
      { key: "award", startDate: "2026-08-02", endDate: "2026-08-02" },
      { key: "annual", startDate: "2026-08-03", endDate: "2026-08-06" },
      {
        key: "regular_overnight",
        startDate: "2026-08-07",
        endDate: "2026-08-08",
      },
    ]);
  });

  it("제자리거나 범위를 벗어난 이동은 원본을 그대로 둔다", () => {
    expect(reorderDrafts(drafts, 1, 1)).toEqual(drafts);
    expect(reorderDrafts(drafts, -1, 0)).toEqual(drafts);
    expect(reorderDrafts(drafts, 0, 5)).toEqual(drafts);
  });
});

describe("총 일수에 맞추기 (달력에서 종료일을 직접 고를 때)", () => {
  it("비어 있으면 전체를 덮는 구간 하나를 만든다", () => {
    expect(fitDraftsToTotal([], 8)).toEqual([{ key: "annual", days: 8 }]);
    expect(fitDraftsToTotal([], 8, "sick")).toEqual([{ key: "sick", days: 8 }]);
  });

  it("총 일수가 없으면 구간도 없다", () => {
    expect(fitDraftsToTotal([], 0)).toEqual([]);
    expect(fitDraftsToTotal([{ key: "annual", days: 3 }], -1)).toEqual([]);
  });

  it("늘리면 마지막 구간이 남는 일수를 흡수한다", () => {
    expect(
      fitDraftsToTotal(
        [
          { key: "annual", days: 2 },
          { key: "award", days: 1 },
        ],
        10,
      ),
    ).toEqual([
      { key: "annual", days: 2 },
      { key: "award", days: 8 },
    ]);
  });

  it("줄이면 넘치는 뒤 구간을 버리고 마지막 남은 구간을 자른다", () => {
    expect(
      fitDraftsToTotal(
        [
          { key: "annual", days: 5 },
          { key: "regular_overnight", days: 4 },
        ],
        3,
      ),
    ).toEqual([{ key: "annual", days: 3 }]);
  });

  it("총 일수가 그대로면 구간도 그대로다", () => {
    const drafts: SegmentDraft[] = [
      { key: "annual", days: 4 },
      { key: "award", days: 4 },
    ];
    expect(fitDraftsToTotal(drafts, 8)).toEqual(drafts);
  });

  it("앞 구간이 목표를 다 쓰면 뒤 구간은 통째로 떨어져 나간다", () => {
    // 예전 fitDrafts도 같은 판단이었다 — 기간을 줄이면 뒤 구간을 버린다.
    // 앞 구간을 억지로 1일로 깎아 모든 종류를 살려 두면, 사용자가 손대지 않은
    // 구간의 개수가 조용히 바뀐다.
    expect(
      fitDraftsToTotal(
        [
          { key: "annual", days: 3 },
          { key: "award", days: 3 },
          { key: "sick", days: 3 },
        ],
        2,
      ),
    ).toEqual([{ key: "annual", days: 2 }]);
  });

  it("366일(상한)까지 한 구간으로 맞춘다", () => {
    expect(fitDraftsToTotal([], 366)).toEqual([{ key: "annual", days: 366 }]);
    // 2026은 평년(365일)이라 366일짜리는 해를 하루 넘긴다.
    expect(draftsEndDate("2026-01-01", fitDraftsToTotal([], 366))).toBe(
      "2027-01-01",
    );
  });
});

describe("서버 형식과 오가기", () => {
  it("서버로 보낼 구간으로 변환한다", () => {
    expect(
      draftsToSegments(START, [
        { key: "annual", days: 4 },
        { key: "regular_overnight", days: 4 },
      ]),
    ).toEqual([
      { category: "annual", startDate: "2026-08-02", endDate: "2026-08-05" },
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-08-06",
        endDate: "2026-08-09",
      },
    ]);
  });

  it("저장된 구간을 개수 초안으로 되돌린다 (시작일 순으로)", () => {
    expect(
      segmentsToDrafts([
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: "2026-08-06",
          endDate: "2026-08-09",
        },
        {
          category: "annual",
          startDate: "2026-08-02",
          endDate: "2026-08-05",
        },
      ]),
    ).toEqual([
      { key: "annual", days: 4 },
      { key: "regular_overnight", days: 4 },
    ]);
  });

  it("같은 재원이 여러 번 나와도 순서를 보존한다", () => {
    expect(
      segmentsToDrafts([
        { category: "annual", startDate: "2026-08-02", endDate: "2026-08-02" },
        { category: "sick", startDate: "2026-08-03", endDate: "2026-08-03" },
        { category: "annual", startDate: "2026-08-04", endDate: "2026-08-09" },
      ]),
    ).toEqual([
      { key: "annual", days: 1 },
      { key: "sick", days: 1 },
      { key: "annual", days: 6 },
    ]);
  });

  it("재원별 사용 일수를 합산한다 (같은 재원이 여러 번 나와도)", () => {
    expect(
      draftDaysByKey([
        { key: "annual", days: 1 },
        { key: "regular_overnight", days: 1 },
        { key: "annual", days: 6 },
      ]),
    ).toEqual(
      new Map([
        ["annual", 7],
        ["regular_overnight", 1],
      ]),
    );
  });
});
