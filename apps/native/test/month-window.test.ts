import { shiftMonth } from "@leave/shared/calendar";
import { describe, expect, it } from "vitest";
import {
  appendMonths,
  capTail,
  CELL_H_MAX,
  CELL_H_MIN,
  INITIAL_SPAN,
  LABEL_H,
  MAX_MONTHS,
  monthBlockHeight,
  monthLabel,
  monthRange,
  PAGE_SIZE,
  prependMonths,
  resolveCellHeight,
  ROW_GAP,
  ROWS,
} from "../src/components/month-window";

/** 목록이 한 달도 건너뛰지 않고 이어지는지. 모든 이동의 전제다. */
function isContiguous(months: string[]): boolean {
  return months.every(
    (month, index) =>
      index === 0 || month === shiftMonth(months[index - 1]!, 1),
  );
}

const CURRENT = "2026-09";
// 친구 달력이 쓰는 범위 — 공유 달력의 조회 정책과 같다.
const EARLIEST = shiftMonth(CURRENT, -12);
const LATEST = shiftMonth(CURRENT, 24);
/** 조회 범위에 들어가는 달 수 — 과거 12 + 현재 1 + 미래 24. */
const RANGE_MONTHS = 37;

describe("월 창 만들기", () => {
  it("가운데 달을 기준으로 앞뒤 같은 수만큼 이어 붙인다", () => {
    const months = monthRange(CURRENT, INITIAL_SPAN);
    expect(months).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(months[INITIAL_SPAN]).toBe(CURRENT);
    expect(isContiguous(months)).toBe(true);
  });

  it("해를 넘겨도 이어진다", () => {
    expect(monthRange("2026-01", 1)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(monthRange("2026-12", 1)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("연도-월 이름을 사람이 읽는 꼴로 만든다", () => {
    expect(monthLabel("2026-09")).toBe("2026년 9월");
    expect(monthLabel("2026-12")).toBe("2026년 12월");
  });
});

describe("위로 이어 붙이기", () => {
  it("한 번에 PAGE_SIZE개월을 앞에 붙이고 목록은 계속 이어진다", () => {
    const before = monthRange(CURRENT, INITIAL_SPAN);
    const after = prependMonths(before, undefined);

    expect(after).toHaveLength(before.length + PAGE_SIZE);
    expect(after.slice(PAGE_SIZE)).toEqual(before);
    expect(isContiguous(after)).toBe(true);
  });

  it("붙인 개수만큼만 인덱스가 밀린다 — 위치 보정이 기대는 성질", () => {
    const before = monthRange(CURRENT, INITIAL_SPAN);
    const watching = before[INITIAL_SPAN]!;
    const after = prependMonths(before, undefined);

    // 화면이 튀지 않으려면 보고 있던 달이 "앞에 붙은 수"만큼 정확히 밀려야 한다.
    expect(after.indexOf(watching)).toBe(before.indexOf(watching) + PAGE_SIZE);
  });

  it("범위 시작을 넘어가는 달은 붙이지 않는다", () => {
    const months = prependMonths([EARLIEST, shiftMonth(EARLIEST, 1)], EARLIEST);
    expect(months).toEqual([EARLIEST, shiftMonth(EARLIEST, 1)]);
  });

  it("범위 경계에서는 남은 달만 붙인다", () => {
    const first = shiftMonth(EARLIEST, 2);
    const months = prependMonths([first], EARLIEST);
    expect(months).toEqual([
      EARLIEST,
      shiftMonth(EARLIEST, 1),
      shiftMonth(EARLIEST, 2),
    ]);
    expect(isContiguous(months)).toBe(true);
  });

  it("더 붙일 게 없으면 받은 배열을 그대로 돌려준다", () => {
    // 같은 참조를 돌려줘야 setMonths가 다시 렌더하지 않는다.
    const months = [EARLIEST, shiftMonth(EARLIEST, 1)];
    expect(prependMonths(months, EARLIEST)).toBe(months);
  });
});

describe("아래로 이어 붙이기", () => {
  it("한 번에 PAGE_SIZE개월을 뒤에 붙인다", () => {
    const before = monthRange(CURRENT, INITIAL_SPAN);
    const after = appendMonths(before, undefined);

    expect(after).toHaveLength(before.length + PAGE_SIZE);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(isContiguous(after)).toBe(true);
  });

  it("범위 끝을 넘어가는 달은 붙이지 않는다", () => {
    const months = [shiftMonth(LATEST, -1), LATEST];
    expect(appendMonths(months, LATEST)).toBe(months);
  });

  it("범위 경계에서는 남은 달만 붙인다", () => {
    const months = appendMonths([shiftMonth(LATEST, -2)], LATEST);
    expect(months).toEqual([
      shiftMonth(LATEST, -2),
      shiftMonth(LATEST, -1),
      LATEST,
    ]);
  });
});

describe("목록 상한", () => {
  it("상한을 넘으면 뒤를 잘라 낸다", () => {
    const months = monthRange("2026-09", 20); // 41개월
    const capped = capTail(months);

    expect(capped).toHaveLength(MAX_MONTHS);
    // 자르는 쪽은 뒤다 — 앞을 자르면 보이는 인덱스가 밀려 스크롤이 튄다.
    expect(capped).toEqual(months.slice(0, MAX_MONTHS));
  });

  it("상한 이하면 그대로 둔다", () => {
    const months = monthRange(CURRENT, INITIAL_SPAN);
    expect(capTail(months)).toBe(months);
  });

  it("위로 계속 끌어도 목록이 상한 안에 머문다", () => {
    let months = monthRange(CURRENT, INITIAL_SPAN);
    for (let i = 0; i < 30; i++) months = prependMonths(months, undefined);

    expect(months.length).toBeLessThanOrEqual(MAX_MONTHS);
    expect(isContiguous(months)).toBe(true);
  });

  it("위로 붙이며 잘라도 새로 붙은 달은 맨 앞에 그대로 남는다", () => {
    const before = capTail(monthRange(CURRENT, 20)).slice(0, MAX_MONTHS);
    const after = prependMonths(before, undefined);

    expect(after).toHaveLength(MAX_MONTHS);
    expect(after[0]).toBe(shiftMonth(before[0]!, -PAGE_SIZE));
    // 앞은 그대로, 뒤만 잘렸다.
    expect(after.slice(PAGE_SIZE)).toEqual(
      before.slice(0, MAX_MONTHS - PAGE_SIZE),
    );
    expect(isContiguous(after)).toBe(true);
  });

  it("범위 안에서 아래위로 오가도 목록이 이어지고 범위를 벗어나지 않는다", () => {
    let months = monthRange(CURRENT, INITIAL_SPAN);
    for (let i = 0; i < 12; i++) {
      months = appendMonths(months, LATEST);
      months = prependMonths(months, EARLIEST);
    }

    expect(isContiguous(months)).toBe(true);
    expect(months[0]! >= EARLIEST).toBe(true);
    expect(months[months.length - 1]! <= LATEST).toBe(true);
    // 아래쪽은 일부러 자르지 않는다 — 앞을 자르면 보이는 인덱스가 밀려 스크롤이
    // 튄다(capTail 주석). 그래서 아래로 훑을 때의 상한은 조회 범위 자체다.
    expect(months.length).toBeLessThanOrEqual(RANGE_MONTHS);
  });
});

describe("달 블록 높이", () => {
  it("좁은 창에서는 칸 높이를 고정한다", () => {
    expect(resolveCellHeight("compact", 2000)).toBe(CELL_H_MIN);
  });

  it("아직 재지 못했으면 최소 높이를 쓴다", () => {
    expect(resolveCellHeight("expanded", 0)).toBe(CELL_H_MIN);
    expect(resolveCellHeight("expanded", -100)).toBe(CELL_H_MIN);
  });

  it("넓은 창에서는 한 달이 화면에 들어오도록 늘리되 상·하한을 지킨다", () => {
    const height = resolveCellHeight("expanded", 900);
    expect(height).toBeGreaterThanOrEqual(CELL_H_MIN);
    expect(height).toBeLessThanOrEqual(CELL_H_MAX);
    // 늘린 블록이 보이는 높이를 넘지 않아야 한 화면 = 한 달이 된다.
    expect(monthBlockHeight(height)).toBeLessThanOrEqual(900);

    expect(resolveCellHeight("expanded", 5000)).toBe(CELL_H_MAX);
    expect(resolveCellHeight("expanded", 100)).toBe(CELL_H_MIN);
  });

  it("블록 높이는 이름 줄과 여섯 주를 더한 값이다", () => {
    expect(monthBlockHeight(CELL_H_MIN)).toBe(
      LABEL_H + ROWS * (CELL_H_MIN + ROW_GAP),
    );
  });
});
