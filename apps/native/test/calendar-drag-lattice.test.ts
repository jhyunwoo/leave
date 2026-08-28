import { buildMonthGrid } from "@leave/shared/calendar";
import { describe, expect, it } from "vitest";
import {
  locateDate,
  resolveDrop,
  type DragLattice,
} from "../src/components/calendar-drag/lattice";

// 좁은 창의 실제 값 — calendar-scroll.tsx의 CELL_H_MIN 92, ROW_GAP 2, LABEL_H 44,
// ROWS 6. 폭은 iPhone 390에서 좌우 여백(spacing.lg 16)을 뺀 358.
const ROW_PITCH = 92 + 2;
const LABEL_HEIGHT = 44;
const ITEM_HEIGHT = LABEL_HEIGHT + 6 * ROW_PITCH;
const COL_PITCH = (358 + 2) / 7;

// 2026-02는 1일이 일요일이고 28일까지라 격자가 정확히 4주다 — 달 블록에 남는
// 빈 주 슬롯을 시험할 수 있는 달.
const MONTHS = ["2026-01", "2026-02", "2026-03"];

const lattice: DragLattice = {
  itemHeight: ITEM_HEIGHT,
  rowPitch: ROW_PITCH,
  colPitch: COL_PITCH,
  labelHeight: LABEL_HEIGHT,
  grids: MONTHS.map((month) => buildMonthGrid(month)),
};

describe("locateDate", () => {
  it("제 달 안의 칸을 찾는다", () => {
    // 2026-01-15는 세 번째 주 목요일.
    expect(locateDate(lattice, "2026-01-15")).toEqual({
      monthIndex: 0,
      row: 2,
      col: 4,
    });
  });

  it("달 밖 채움 칸이 아니라 제 달의 칸을 고른다", () => {
    // 2026-02-01은 1월 격자에는 없고(1월은 1/31에서 끊긴다) 2월 격자 첫 칸이다.
    expect(locateDate(lattice, "2026-02-01")).toEqual({
      monthIndex: 1,
      row: 0,
      col: 0,
    });
  });

  it("목록에 없는 달이면 null", () => {
    expect(locateDate(lattice, "2026-07-01")).toBeNull();
  });
});

describe("resolveDrop", () => {
  const from = locateDate(lattice, "2026-01-15")!;

  it("움직이지 않았으면 집어 든 날짜 그대로", () => {
    expect(resolveDrop(lattice, from, 0, 0)).toBe("2026-01-15");
  });

  it("한 칸 옆은 하루", () => {
    expect(resolveDrop(lattice, from, COL_PITCH, 0)).toBe("2026-01-16");
    expect(resolveDrop(lattice, from, -COL_PITCH, 0)).toBe("2026-01-14");
  });

  it("한 줄 아래는 일주일", () => {
    expect(resolveDrop(lattice, from, 0, ROW_PITCH)).toBe("2026-01-22");
    expect(resolveDrop(lattice, from, 0, -ROW_PITCH)).toBe("2026-01-08");
  });

  it("칸 안에서 조금 움직인 것으로는 날짜가 바뀌지 않는다", () => {
    expect(resolveDrop(lattice, from, COL_PITCH * 0.4, ROW_PITCH * 0.4)).toBe(
      "2026-01-15",
    );
  });

  it("달 이름 띠를 넘어 다음 달 칸으로 놓을 수 있다", () => {
    // 1/29(다섯째 주)에서 2/5(2월 첫 주)까지 = 달 블록 하나만큼 아래.
    const january29 = locateDate(lattice, "2026-01-29")!;
    const dy =
      ITEM_HEIGHT +
      LABEL_HEIGHT +
      0 * ROW_PITCH -
      (LABEL_HEIGHT + 4 * ROW_PITCH);
    expect(resolveDrop(lattice, january29, 0, dy)).toBe("2026-02-05");
  });

  it("달 블록 아래 남는 빈 주 칸에는 놓을 수 없다", () => {
    // 2월은 4주뿐인데 블록은 6주 높이다. 다섯째 줄 자리는 빈 공간이라 null이어야
    // 한다 — 마지막 주로 끌어당기면 휴가가 조용히 일주일 밀린다.
    const february1 = locateDate(lattice, "2026-02-01")!;
    expect(resolveDrop(lattice, february1, 0, 4 * ROW_PITCH)).toBeNull();
  });

  it("앞뒤 달에서 넘어온 채움 칸에는 놓을 수 없다", () => {
    // 1월 격자 첫 줄 맨 왼쪽은 2025-12-28이다.
    expect(
      resolveDrop(lattice, from, -4 * COL_PITCH, -2 * ROW_PITCH),
    ).toBeNull();
  });

  it("가로로는 화면 밖으로 나가지 않고 가장 가까운 열에 붙는다", () => {
    expect(resolveDrop(lattice, from, -20 * COL_PITCH, 0)).toBe("2026-01-11");
    expect(resolveDrop(lattice, from, 20 * COL_PITCH, 0)).toBe("2026-01-17");
  });

  it("목록에 담긴 달 밖으로 나가면 null", () => {
    expect(resolveDrop(lattice, from, 0, 10 * ITEM_HEIGHT)).toBeNull();
    expect(resolveDrop(lattice, from, 0, -10 * ITEM_HEIGHT)).toBeNull();
  });
});
