import { describe, expect, it } from "vitest";
import {
  buildLeaveShareCard,
  defaultShareMonth,
  fitShareText,
  SHARE_BALANCE_COLORS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
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
  title: `휴가 ${id}`,
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

const barsOf = (shapes: ReturnType<typeof buildLeaveShareCard>["shapes"]) =>
  shapes.filter(
    (shape): shape is ShareRect =>
      shape.kind === "rect" && shape.height === 52 && shape.radius === 14,
  );

describe("buildLeaveShareCard", () => {
  it("나가는 날만 세고, 초안·반려·취소는 넣지 않는다", () => {
    const card = buildLeaveShareCard({
      month: "2026-10",
      leaves: [
        leave("a", "approved", [annual("2026-10-05", "2026-10-07")]),
        leave("b", "draft", [annual("2026-10-12", "2026-10-13")]),
        leave("c", "cancelled", [annual("2026-10-20", "2026-10-20")]),
        leave("d", "rejected", [annual("2026-10-21", "2026-10-21")]),
      ],
    });
    expect(card.outDays).toBe(3);
    expect(card.width).toBe(SHARE_CARD_WIDTH);
    expect(card.height).toBe(SHARE_CARD_HEIGHT);
  });

  it("이어지는 날은 주마다 막대 하나로, 재원이 바뀌면 새 막대로 그린다", () => {
    // 2026-10-03(토)~10-06(화): 토요일에서 한 주가 끝나 두 막대가 된다.
    // 10-05~06은 정기외박이라 같은 주 안에서도 색이 갈린다.
    const card = buildLeaveShareCard({
      month: "2026-10",
      leaves: [
        leave("a", "shared", [
          annual("2026-10-03", "2026-10-04"),
          {
            category: "overnight",
            overnightKind: "regular",
            startDate: "2026-10-05",
            endDate: "2026-10-06",
          },
        ]),
      ],
    });
    const bars = barsOf(card.shapes);
    expect(bars.map((bar) => bar.fill)).toEqual([
      SHARE_BALANCE_COLORS.annual.bg,
      SHARE_BALANCE_COLORS.annual.bg,
      SHARE_BALANCE_COLORS.regular_overnight.bg,
    ]);
    // 제목은 첫 막대에만 적는다.
    const titles = card.shapes.filter(
      (shape): shape is ShareText =>
        shape.kind === "text" && shape.text.startsWith("휴가"),
    );
    expect(titles).toHaveLength(1);
  });

  it("다른 달에 걸친 날은 그리지 않는다", () => {
    const card = buildLeaveShareCard({
      month: "2026-10",
      leaves: [leave("a", "approved", [annual("2026-09-29", "2026-10-02")])],
    });
    expect(card.outDays).toBe(2);
  });

  it("모든 도형이 이미지 안에 들어간다 (6주짜리 달 포함)", () => {
    // 2026-08은 토요일에 시작해 6주가 된다.
    const card = buildLeaveShareCard({
      month: "2026-08",
      leaves: [
        leave("a", "approved", [
          annual("2026-08-01", "2026-08-02"),
          { category: "award", startDate: "2026-08-03", endDate: "2026-08-03" },
          {
            category: "overnight",
            overnightKind: "other",
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
      ],
    });
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
