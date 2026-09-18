import { describe, expect, it } from "vitest";
import {
  buildRangeIndex,
  sliceMonthPreview,
} from "../src/components/month-cell-index";

/** 2026-02 그리드가 실제로 그리는 범위(윤년). 앞뒤 달 채움 칸을 포함한다. */
const GRID_FROM = "2026-02-01";
const GRID_THROUGH = "2026-03-07";

describe("buildRangeIndex", () => {
  it("기간을 날짜별로 펼친다", () => {
    const index = buildRangeIndex(
      [{ id: "a", startDate: "2026-02-10", endDate: "2026-02-12" }],
      GRID_FROM,
      GRID_THROUGH,
    );
    expect([...index.keys()]).toEqual([
      "2026-02-10",
      "2026-02-11",
      "2026-02-12",
    ]);
    expect(index.get("2026-02-11")?.[0]?.id).toBe("a");
  });

  it("윤년 2월 29일을 건너뛰지 않는다", () => {
    const index = buildRangeIndex(
      [{ id: "a", startDate: "2024-02-28", endDate: "2024-03-01" }],
      "2024-02-01",
      "2024-03-09",
    );
    expect([...index.keys()]).toEqual([
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
  });

  it("격자 밖으로 뻗은 기간은 격자 범위로 잘라 담는다", () => {
    // 검열처럼 몇 달짜리 일정을 그대로 펼치면 보지도 않을 날짜가 표에 쌓인다.
    const index = buildRangeIndex(
      [{ id: "검열", startDate: "2025-11-01", endDate: "2026-06-30" }],
      GRID_FROM,
      GRID_THROUGH,
    );
    expect(index.size).toBe(35);
    expect(index.has("2026-01-31")).toBe(false);
    expect(index.has("2026-02-01")).toBe(true);
    expect(index.has("2026-03-07")).toBe(true);
    expect(index.has("2026-03-08")).toBe(false);
  });

  it("겹치는 항목을 입력 순서대로 쌓는다 — 칸 라벨이 첫 제목을 쓴다", () => {
    const index = buildRangeIndex(
      [
        { id: "먼저", startDate: "2026-02-10", endDate: "2026-02-10" },
        { id: "나중", startDate: "2026-02-10", endDate: "2026-02-10" },
      ],
      GRID_FROM,
      GRID_THROUGH,
    );
    expect(index.get("2026-02-10")?.map((event) => event.id)).toEqual([
      "먼저",
      "나중",
    ]);
  });

  it("항목이 없으면 빈 표다", () => {
    expect(buildRangeIndex(undefined, GRID_FROM, GRID_THROUGH).size).toBe(0);
    expect(buildRangeIndex([], GRID_FROM, GRID_THROUGH).size).toBe(0);
  });
});

describe("sliceMonthPreview", () => {
  const preview = new Map([
    ["2026-01-31", "origin"],
    ["2026-02-01", "target"],
    ["2026-02-02", "target"],
  ]);

  it("그 달에 걸친 칸만 남긴다", () => {
    const slice = sliceMonthPreview(preview, "2026-02");
    expect([...slice!.keys()]).toEqual(["2026-02-01", "2026-02-02"]);
  });

  it("걸치지 않는 달에는 null을 준다 — 그래야 memo가 산다", () => {
    // 이 null이 안정적인 값이어서, 드래그와 무관한 달이 hover마다 다시 그려지지
    // 않는다. 새 빈 Map을 주면 그 성질이 사라진다.
    expect(sliceMonthPreview(preview, "2026-03")).toBeNull();
    expect(sliceMonthPreview(null, "2026-02")).toBeNull();
  });

  it("12월 → 1월 경계에서 해가 다른 같은 달 번호를 섞지 않는다", () => {
    const yearEnd = new Map([
      ["2025-12-31", "origin"],
      ["2026-01-01", "target"],
    ]);
    expect([...sliceMonthPreview(yearEnd, "2025-12")!.keys()]).toEqual([
      "2025-12-31",
    ]);
    expect([...sliceMonthPreview(yearEnd, "2026-01")!.keys()]).toEqual([
      "2026-01-01",
    ]);
  });
});
