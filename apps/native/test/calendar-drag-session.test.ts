import { describe, expect, it } from "vitest";
import { CalendarDragSession } from "../src/components/calendar-drag/session";

const metrics = {
  itemHeight: 608,
  rowPitch: 94,
  colPitch: 50,
  labelHeight: 44,
  months: ["2026-01", "2026-02", "2026-03"],
};
const primary = { id: 7, absoluteX: 220, absoluteY: 320 };
const secondary = { id: 12, absoluteX: 80, absoluteY: 650 };
function begin() {
  return new CalendarDragSession(
    { kind: "leave", leaveId: "leave-1" },
    "2026-01-15",
    primary,
    metrics,
    0,
  );
}

describe("CalendarDragSession", () => {
  it("다른 손가락은 달력만 스크롤하고 첫 손가락 아래 날짜를 갱신한다", () => {
    const session = begin();
    session.move([primary, secondary], 1400);
    session.move([{ ...secondary, absoluteY: 42 }, primary], 1400);
    expect(session.scrollOffset).toBe(608);
    expect(session.drag.hoverDate).toBe("2026-02-19");
    expect(session.drag.deltaDays).toBe(35);
    expect(session.release([primary.id])).toBe("drop");
  });

  it("첫 손가락 이동으로는 달력이 스크롤되지 않는다", () => {
    const session = begin();
    session.move([{ ...primary, absoluteY: 414 }], 1400);
    expect(session.scrollOffset).toBe(0);
    expect(session.drag.hoverDate).toBe("2026-01-22");
  });

  it("움직이지 않은 길게 누르기는 미세한 손떨림을 허용하고 편집을 연다", () => {
    const session = begin();
    session.move([{ ...primary, absoluteX: 223, absoluteY: 322 }], 1400);
    expect(session.release([primary.id])).toBe("cancel");
  });

  it("움직였다 원래 날짜로 돌아오면 편집을 열지 않는다", () => {
    const session = begin();
    session.move([{ ...primary, absoluteX: 270 }], 1400);
    session.move([primary], 1400);
    expect(session.drag.deltaDays).toBe(0);
    expect(session.release([primary.id])).toBe("drop");
  });

  it("둘째 손가락을 뗐다 다시 올려도 휴가를 놓거나 스크롤이 튀지 않는다", () => {
    const session = begin();
    session.move([primary, secondary], 1400);
    session.move([primary, { ...secondary, absoluteY: 556 }], 1400);
    expect(session.release([secondary.id])).toBeNull();
    session.move([primary, { ...secondary, id: 20, absoluteY: 500 }], 1400);
    expect(session.scrollOffset).toBe(94);
    session.move([primary, { ...secondary, id: 20, absoluteY: 406 }], 1400);
    expect(session.scrollOffset).toBe(188);
    expect(session.drag.hoverDate).toBe("2026-01-29");
  });

  it("첫째 손가락을 먼저 떼면 둘째가 남아 있어도 놓는다", () => {
    const session = begin();
    session.move([primary, secondary], 1400);
    session.move([primary, { ...secondary, absoluteY: 556 }], 1400);
    expect(session.release([primary.id])).toBe("drop");
  });

  it("목록 앞에 달을 붙여도 같은 날짜와 이동량을 유지한다", () => {
    const session = begin();
    session.move([primary, secondary], 1400);
    session.move([primary, { ...secondary, absoluteY: 42 }], 1400);
    session.rebase({ ...metrics, months: ["2025-12", ...metrics.months] });
    expect(session.scrollOffset).toBe(1216);
    expect(session.drag.hoverDate).toBe("2026-02-19");
    expect(session.drag.deltaDays).toBe(35);
  });

  it("원래 달이 목록에서 사라져도 앞선 달로 계속 옮긴다", () => {
    const session = begin();
    session.rebase({ ...metrics, months: ["2025-10", "2025-11", "2025-12"] });
    session.move([primary, secondary], 1824);
    session.move([primary, { ...secondary, absoluteY: 1258 }], 1824);
    expect(session.drag.hoverDate).toBe("2025-12-18");
    expect(session.drag.deltaDays).toBe(-28);
  });

  it("스크롤 끝에서는 실제 이동한 거리만 날짜에 반영한다", () => {
    const session = begin();
    session.move([primary, secondary], 94);
    session.move([primary, { ...secondary, absoluteY: -500 }], 94);
    expect(session.scrollOffset).toBe(94);
    expect(session.drag.hoverDate).toBe("2026-01-22");
  });

  it("회전으로 격자 크기가 바뀌면 좌표를 재사용하지 않는다", () => {
    expect(begin().rebase({ ...metrics, colPitch: 70 })).toBe(false);
  });

  it("셋째 손가락은 휴가나 스크롤을 움직이지 않는다", () => {
    const session = begin();
    session.move([primary, secondary], 1400);
    session.move(
      [{ id: 30, absoluteX: 300, absoluteY: 30 }, primary, secondary],
      1400,
    );
    expect(session.scrollOffset).toBe(0);
    expect(session.drag.hoverDate).toBe("2026-01-15");
  });
});
