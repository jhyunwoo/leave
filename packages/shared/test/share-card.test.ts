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

describe("다음 달로 이어지는 휴가", () => {
  const nextFills = (card: ReturnType<typeof buildLeaveShareCard>) =>
    card.shapes.filter(
      (shape): shape is ShareRect =>
        shape.kind === "rect" && shape.fill === "#f2f4f0",
    );

  it("휴가가 끝나는 다음 달 날짜까지 줄을 늘려 그리고, 다음 달 칸을 따로 표시한다", () => {
    // 2026-02는 일요일에 시작해 4주로 끝난다. 2/25(수)~3/5(목) 휴가.
    const card = build("2026-02", [
      leave("a", "approved", [annual("2026-02-25", "2026-03-05")]),
    ]);
    const texts = textsOf(card.shapes);
    // 다음 달 1일은 달을 붙여 적고, 휴가 기간은 달로 자르지 않는다.
    expect(texts).toContain("3/1");
    expect(texts).toContain("2/25–3/5");
    // 나가는 날 수는 이 달 몫만 센다.
    expect(card.outDays).toBe(4);
    // 이 달 막대(2/25~28)와 다음 달 막대(3/1~5).
    expect(barsOf(card.shapes)).toHaveLength(2);
    // 다음 달 줄(3/1~3/7)에 옅은 바탕이 깔린다.
    expect(nextFills(card)).toHaveLength(1);
    // 같은 숫자가 두 달에 다 있으면 뒤의 것이 다음 달이다.
    const day = (label: string) =>
      card.shapes
        .filter(
          (shape): shape is ShareText =>
            shape.kind === "text" && shape.size === 30 && shape.text === label,
        )
        .at(-1);
    // 다음 달 평일 숫자는 이 달 평일 숫자보다 흐리다.
    expect(day("4")?.fill).not.toBe(day("24")?.fill);
  });

  it("다음 달로 넘어가는 휴가가 없으면 이 달 밖의 칸은 그리지 않는다", () => {
    const card = build("2026-02", [
      leave("a", "approved", [annual("2026-02-10", "2026-02-12")]),
    ]);
    expect(nextFills(card)).toHaveLength(0);
    expect(textsOf(card.shapes)).not.toContain("3/1");
  });

  it("아주 길게 이어져도 줄 수에 상한을 두고 모든 도형이 이미지 안에 든다", () => {
    // 2026-08은 6주짜리 달이다. 8/20~9/30이면 두 줄까지만 늘린다.
    const card = build("2026-08", [
      leave("a", "approved", [annual("2026-08-20", "2026-09-30")]),
    ]);
    const days = card.shapes.filter(
      (shape) =>
        shape.kind === "text" && shape.weight === 600 && shape.size < 30,
    );
    expect(days.length).toBeGreaterThan(0);
    for (const shape of card.shapes) {
      if (shape.kind !== "rect") continue;
      expect(shape.x + shape.width).toBeLessThanOrEqual(SHARE_CARD_WIDTH);
      expect(shape.y + shape.height).toBeLessThanOrEqual(SHARE_CARD_HEIGHT);
    }
    // 8줄째(9/13~9/19)까지만 그린다. 19는 8월·9월 두 번, 20은 8월 한 번만 나온다.
    const count = (label: string) =>
      card.shapes.filter(
        (shape) => shape.kind === "text" && shape.text === label,
      ).length;
    expect(count("19")).toBe(2);
    expect(count("20")).toBe(1);
  });
});

describe("날짜 색", () => {
  const colorOf = (
    card: ReturnType<typeof buildLeaveShareCard>,
    label: string,
  ) =>
    card.shapes.find(
      (shape): shape is ShareText =>
        shape.kind === "text" && shape.size === 30 && shape.text === label,
    )?.fill;

  it("토·일과 공휴일(대체공휴일 포함)은 빨갛게, 평일은 검게 칠한다", () => {
    // 2026-10: 3일(토) 개천절, 9일(금) 한글날, 10일(토), 11일(일), 13일(화).
    const october = build("2026-10", []);
    const red = colorOf(october, "4");
    expect(colorOf(october, "10")).toBe(red);
    expect(colorOf(october, "3")).toBe(red);
    expect(colorOf(october, "9")).toBe(red);
    expect(colorOf(october, "13")).not.toBe(red);
    // 2026-03-02(월)은 삼일절(일요일)의 대체공휴일이다.
    expect(colorOf(build("2026-03", []), "2")).toBe(red);
    // 요일 머리의 토도 빨갛다.
    const header = (label: string) =>
      october.shapes.find(
        (shape): shape is ShareText =>
          shape.kind === "text" && shape.size === 28 && shape.text === label,
      )?.fill;
    expect(header("토")).toBe(red);
    expect(header("월")).not.toBe(red);
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
