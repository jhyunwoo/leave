import { describe, expect, it } from "vitest";
import {
  buildLeaveShareCard,
  defaultShareMonth,
  fitShareText,
  SHARE_BACKGROUNDS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  SHARE_KIND_COLORS,
  type ShareLeave,
  type ShareRect,
  type ShareText,
} from "../src";

const leave = (
  id: string,
  status: string,
  segments: ShareLeave["segments"],
): ShareLeave & { startDate: string; endDate: string } => ({
  id,
  status,
  segments,
  startDate: segments[0]!.startDate,
  endDate: segments[segments.length - 1]!.endDate,
});

const annual = (startDate: string, endDate: string) => ({
  category: "annual" as const,
  startDate,
  endDate,
});

const build = (
  month: string,
  leaves: readonly ShareLeave[],
  options: Partial<Parameters<typeof buildLeaveShareCard>[0]> = {},
) =>
  buildLeaveShareCard({
    month,
    leaves,
    background: "green",
    showOutings: true,
    ...options,
  });

const textsOf = (shapes: ReturnType<typeof buildLeaveShareCard>["shapes"]) =>
  shapes
    .filter((shape): shape is ShareText => shape.kind === "text")
    .map((shape) => shape.text);

const barsOf = (shapes: ReturnType<typeof buildLeaveShareCard>["shapes"]) =>
  shapes.filter(
    (shape): shape is ShareRect =>
      shape.kind === "rect" && shape.height === 52 && shape.radius === 14,
  );

describe("buildLeaveShareCard", () => {
  it("나가는 날만 세고, 초안·반려·취소는 넣지 않는다", () => {
    const card = build("2026-10", [
      leave("a", "approved", [annual("2026-10-05", "2026-10-07")]),
      leave("b", "draft", [annual("2026-10-12", "2026-10-13")]),
      leave("c", "cancelled", [annual("2026-10-20", "2026-10-20")]),
      leave("d", "rejected", [annual("2026-10-21", "2026-10-21")]),
    ]);
    expect(card.outDays).toBe(3);
    expect(card.width).toBe(SHARE_CARD_WIDTH);
    expect(card.height).toBe(SHARE_CARD_HEIGHT);
  });

  it("재원을 가르지 않고 한 휴가는 한 색으로 잇고, 기간을 한 번만 적는다", () => {
    // 2026-10-03(토)~10-06(화): 토요일에서 한 주가 끝나 두 막대가 된다.
    // 10-05~06은 정기외박이지만 같은 휴가라 같은 막대에 이어진다.
    const card = build("2026-10", [
      leave("a", "shared", [
        annual("2026-10-03", "2026-10-04"),
        {
          category: "overnight",
          startDate: "2026-10-05",
          endDate: "2026-10-06",
        },
      ]),
    ]);
    const bars = barsOf(card.shapes);
    expect(bars.map((bar) => [bar.fill, Math.round(bar.width)])).toEqual([
      [SHARE_KIND_COLORS.leave.bg, 127],
      [SHARE_KIND_COLORS.leave.bg, 397],
    ]);
    const texts = textsOf(card.shapes);
    expect(texts).toContain("10/3–10/6");
    expect(texts.filter((value) => value.includes("10/3"))).toHaveLength(1);
    // 재원 이름도, 나가는 날 수 알약도 없다. 외출이 없으면 범례도 없다.
    for (const gone of ["연가", "정기외박", "4일 나가요", "휴가 a"]) {
      expect(texts).not.toContain(gone);
    }
  });

  it("한 칸짜리 막대뿐이면 날짜만 짧게 적는다", () => {
    // 2026-10-10(토)~10-11(일): 주가 갈려 두 막대 모두 한 칸이다.
    const card = build("2026-10", [
      leave("a", "approved", [annual("2026-10-10", "2026-10-11")]),
    ]);
    expect(textsOf(card.shapes)).toContain("10–11일");
  });

  it("외출은 고른 경우에만 따로 칠하고 범례를 단다", () => {
    const leaves = [
      leave("a", "approved", [annual("2026-10-05", "2026-10-07")]),
      leave("b", "approved", [
        { category: "outing", startDate: "2026-10-13", endDate: "2026-10-13" },
      ]),
    ];
    const hidden = build("2026-10", leaves, { showOutings: false });
    expect(hidden.outDays).toBe(3);
    expect(barsOf(hidden.shapes)).toHaveLength(1);
    expect(textsOf(hidden.shapes)).not.toContain("외출");

    const shown = build("2026-10", leaves, { showOutings: true });
    expect(shown.outDays).toBe(4);
    expect(barsOf(shown.shapes).map((bar) => bar.fill)).toEqual([
      SHARE_KIND_COLORS.leave.bg,
      SHARE_KIND_COLORS.outing.bg,
    ]);
    expect(textsOf(shown.shapes)).toEqual(
      expect.arrayContaining(["휴가", "외출", "10/13"]),
    );
  });

  it("고른 바탕색으로 칠하고, 어두운 바탕에서는 머리 글자를 밝게 바꾼다", () => {
    const black = SHARE_BACKGROUNDS.find((option) => option.id === "black")!;
    const card = build(
      "2026-10",
      [leave("a", "approved", [annual("2026-10-05", "2026-10-07")])],
      { background: "black" },
    );
    expect(card.shapes[0]).toMatchObject({ kind: "rect", fill: black.fill });
    const title = card.shapes.find(
      (shape): shape is ShareText =>
        shape.kind === "text" && shape.text === "10월 휴가",
    );
    expect(title?.fill).toBe(black.ink);
  });

  it("다른 달에 걸친 날은 그리지 않는다", () => {
    const card = build("2026-10", [
      leave("a", "approved", [annual("2026-09-29", "2026-10-02")]),
    ]);
    expect(card.outDays).toBe(2);
  });

  it("모든 도형이 이미지 안에 들어간다 (6주짜리 달 포함)", () => {
    // 2026-08은 토요일에 시작해 6주가 된다.
    const card = build("2026-08", [
      leave("a", "approved", [
        annual("2026-08-01", "2026-08-02"),
        { category: "award", startDate: "2026-08-03", endDate: "2026-08-03" },
        {
          category: "overnight",
          startDate: "2026-08-04",
          endDate: "2026-08-04",
        },
      ]),
      leave("b", "approved", [
        {
          category: "outing",
          startDate: "2026-08-31",
          endDate: "2026-08-31",
        },
      ]),
    ]);
    for (const shape of card.shapes) {
      if (shape.kind !== "rect") continue;
      expect(shape.x + shape.width).toBeLessThanOrEqual(SHARE_CARD_WIDTH);
      expect(shape.y + shape.height).toBeLessThanOrEqual(SHARE_CARD_HEIGHT);
    }
  });
});

describe("defaultShareMonth", () => {
  it("가장 가까운 다가오는 휴가의 달을 고른다", () => {
    const leaves = [
      leave("past", "approved", [annual("2026-08-01", "2026-08-02")]),
      leave("far", "approved", [annual("2027-01-10", "2027-01-12")]),
      leave("near", "approved", [annual("2026-11-20", "2026-11-22")]),
      leave("draft", "draft", [annual("2026-10-20", "2026-10-22")]),
    ];
    expect(defaultShareMonth(leaves, "2026-10-14")).toBe("2026-11");
  });

  it("진행 중이거나 다가오는 휴가가 없으면 이번 달", () => {
    expect(defaultShareMonth([], "2026-10-14")).toBe("2026-10");
    expect(
      defaultShareMonth(
        [leave("now", "approved", [annual("2026-09-30", "2026-10-16")])],
        "2026-10-14",
      ),
    ).toBe("2026-10");
  });
});

describe("fitShareText", () => {
  it("폭을 넘으면 말줄임으로 자른다", () => {
    expect(fitShareText("짧은", 200, 26)).toBe("짧은");
    expect(fitShareText("아주아주긴휴가제목입니다", 120, 26)).toBe("아주아주…");
    expect(fitShareText("휴가", 10, 26)).toBe("");
  });
});
