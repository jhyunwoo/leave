import { describe, expect, it } from "vitest";
import {
  draftDaysByKey,
  draftsToSegments,
  fitDrafts,
  removeDraft,
  resolveDrafts,
  segmentsToDrafts,
  setDraftEnd,
  splitLastDraft,
  type SegmentDraft,
} from "../src";

const START = "2026-08-02";
const END = "2026-08-09"; // 8일

describe("휴가 구간 초안", () => {
  it("비어 있으면 전체 기간을 덮는 구간 하나를 만든다", () => {
    expect(fitDrafts([], START, END)).toEqual([
      { key: "annual", endDate: END },
    ]);
  });

  it("기간이 정해지지 않았으면 구간도 없다", () => {
    expect(fitDrafts([], "", "")).toEqual([]);
    expect(fitDrafts([], END, START)).toEqual([]);
  });

  it("마지막 구간은 항상 종료일까지 늘어난다", () => {
    const drafts: SegmentDraft[] = [{ key: "annual", endDate: "2026-08-04" }];
    expect(fitDrafts(drafts, START, END)).toEqual([
      { key: "annual", endDate: END },
    ]);
  });

  it("기간을 줄이면 범위를 벗어난 구간은 버린다", () => {
    const drafts: SegmentDraft[] = [
      { key: "annual", endDate: "2026-08-05" },
      { key: "regular_overnight", endDate: "2026-08-09" },
    ];
    expect(fitDrafts(drafts, START, "2026-08-04")).toEqual([
      { key: "annual", endDate: "2026-08-04" },
    ]);
  });

  it("마지막 구간을 반으로 나눠 새 구간을 만든다", () => {
    const drafts = fitDrafts([], START, END);
    const split = splitLastDraft(drafts, START, END, "regular_overnight")!;
    // 스크린샷의 예시와 같은 8/2~8/5 연가 + 8/6~8/9 정기외박.
    expect(resolveDrafts(START, split)).toMatchObject([
      {
        key: "annual",
        startDate: "2026-08-02",
        endDate: "2026-08-05",
        days: 4,
      },
      {
        key: "regular_overnight",
        startDate: "2026-08-06",
        endDate: "2026-08-09",
        days: 4,
      },
    ]);
  });

  it("하루짜리 구간은 더 나눌 수 없다", () => {
    const drafts = fitDrafts([], START, START);
    expect(splitLastDraft(drafts, START, START, "annual")).toBe(null);
  });

  it("구간 종료일을 바꾸면 뒤 구간 시작일이 따라 밀린다", () => {
    const drafts = splitLastDraft(
      fitDrafts([], START, END),
      START,
      END,
      "regular_overnight",
    )!;
    const moved = setDraftEnd(drafts, 0, "2026-08-03", START, END);
    expect(resolveDrafts(START, moved)).toMatchObject([
      {
        key: "annual",
        startDate: "2026-08-02",
        endDate: "2026-08-03",
        days: 2,
      },
      {
        key: "regular_overnight",
        startDate: "2026-08-04",
        endDate: "2026-08-09",
        days: 6,
      },
    ]);
  });

  it("마지막 구간의 종료일은 휴가 종료일에 고정이라 바뀌지 않는다", () => {
    const drafts = fitDrafts([], START, END);
    expect(setDraftEnd(drafts, 0, "2026-08-04", START, END)).toEqual(drafts);
  });

  it("구간을 지우면 남은 구간이 전체를 다시 덮는다", () => {
    const drafts = splitLastDraft(
      fitDrafts([], START, END),
      START,
      END,
      "regular_overnight",
    )!;
    const removed = removeDraft(drafts, 0, START, END);
    expect(resolveDrafts(START, removed)).toMatchObject([
      { key: "regular_overnight", startDate: START, endDate: END, days: 8 },
    ]);
  });

  it("구간이 하나뿐이면 지우지 않는다", () => {
    const drafts = fitDrafts([], START, END);
    expect(removeDraft(drafts, 0, START, END)).toEqual(drafts);
  });

  it("서버로 보낼 구간으로 변환한다", () => {
    const drafts = splitLastDraft(
      fitDrafts([], START, END),
      START,
      END,
      "regular_overnight",
    )!;
    expect(draftsToSegments(START, drafts)).toEqual([
      { category: "annual", startDate: "2026-08-02", endDate: "2026-08-05" },
      {
        category: "overnight",
        overnightKind: "regular",
        startDate: "2026-08-06",
        endDate: "2026-08-09",
      },
    ]);
  });

  it("저장된 구간을 초안으로 되돌린다", () => {
    expect(
      segmentsToDrafts([
        {
          category: "overnight",
          overnightKind: "regular",
          endDate: "2026-08-09",
        },
        { category: "annual", endDate: "2026-08-05" },
      ]),
    ).toEqual([
      { key: "annual", endDate: "2026-08-05" },
      { key: "regular_overnight", endDate: "2026-08-09" },
    ]);
  });

  it("재원별 사용 일수를 합산한다 (같은 재원이 여러 번 나와도)", () => {
    const drafts: SegmentDraft[] = [
      { key: "annual", endDate: "2026-08-02" },
      { key: "regular_overnight", endDate: "2026-08-03" },
      { key: "annual", endDate: "2026-08-09" },
    ];
    expect(draftDaysByKey(START, drafts)).toEqual(
      new Map([
        ["annual", 7],
        ["regular_overnight", 1],
      ]),
    );
  });
});
