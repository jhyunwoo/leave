/**
 * 다음 휴가까지 남은 날을 세는 규칙.
 *
 * 경계가 미묘하다 — 오늘 시작하는 휴가는 이미 나가 있는 것이고, 그때부터는 시작일이
 * 아니라 종료일까지 센다. 오늘이 종료일이면 0(D-DAY)이지 음수가 아니다.
 */

import { describe, expect, it } from "vitest";
import { nextLeaveCountdown } from "../src/next-leave-countdown";
import type { MyLeave } from "../src/types";

const TODAY = "2026-08-16";

function leave(
  id: string,
  startDate: string,
  endDate: string,
  status: MyLeave["status"] = "shared",
): MyLeave {
  return {
    id,
    userId: "u1",
    title: "연가 계획",
    startDate,
    endDate,
    reason: null,
    status,
    segments: [{ category: "annual", startDate, endDate, days: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as MyLeave;
}

describe("nextLeaveCountdown", () => {
  it("목록이 없으면 null이다", () => {
    expect(nextLeaveCountdown(undefined, TODAY)).toBeNull();
    expect(nextLeaveCountdown([], TODAY)).toBeNull();
  });

  it("지난 휴가만 있으면 null이다", () => {
    const result = nextLeaveCountdown(
      [leave("a", "2026-08-10", "2026-08-15")],
      TODAY,
    );
    expect(result).toBeNull();
  });

  it("아직 오지 않은 휴가는 시작일까지 센다", () => {
    const result = nextLeaveCountdown(
      [leave("a", "2026-08-28", "2026-08-30")],
      TODAY,
    );
    expect(result).toMatchObject({ phase: "upcoming", days: 12 });
    expect(result?.leave.id).toBe("a");
  });

  it("내일 시작하는 휴가는 D-1이다", () => {
    const result = nextLeaveCountdown(
      [leave("a", "2026-08-17", "2026-08-18")],
      TODAY,
    );
    expect(result).toMatchObject({ phase: "upcoming", days: 1 });
  });

  it("오늘 시작하는 휴가는 이미 나간 것이고 종료일까지 센다", () => {
    const result = nextLeaveCountdown([leave("a", TODAY, "2026-08-19")], TODAY);
    expect(result).toMatchObject({ phase: "onLeave", days: 3 });
  });

  it("진행 중인 휴가는 종료일까지 센다", () => {
    const result = nextLeaveCountdown(
      [leave("a", "2026-08-14", "2026-08-18")],
      TODAY,
    );
    expect(result).toMatchObject({ phase: "onLeave", days: 2 });
  });

  it("오늘이 종료일이면 0이다 — 음수로 내려가지 않는다", () => {
    const result = nextLeaveCountdown([leave("a", "2026-08-14", TODAY)], TODAY);
    expect(result).toMatchObject({ phase: "onLeave", days: 0 });
  });

  it("진행 중인 휴가가 있으면 뒤에 잡아 둔 휴가보다 먼저 잡힌다", () => {
    const result = nextLeaveCountdown(
      [
        leave("later", "2026-08-20", "2026-08-22"),
        leave("now", "2026-08-15", "2026-08-18"),
      ],
      TODAY,
    );
    expect(result?.leave.id).toBe("now");
    expect(result).toMatchObject({ phase: "onLeave", days: 2 });
  });

  it("미래 휴가가 여럿이면 가장 가까운 것을 고른다", () => {
    const result = nextLeaveCountdown(
      [
        leave("c", "2026-10-01", "2026-10-03"),
        leave("a", "2026-08-20", "2026-08-22"),
        leave("b", "2026-09-01", "2026-09-02"),
      ],
      TODAY,
    );
    expect(result?.leave.id).toBe("a");
    expect(result?.days).toBe(4);
  });

  it("초안은 세지 않는다 — 나만 보는 시뮬레이션이다", () => {
    const result = nextLeaveCountdown(
      [leave("draft", "2026-08-18", "2026-08-19", "draft")],
      TODAY,
    );
    expect(result).toBeNull();
  });

  it("반려·취소는 세지 않는다 — 실제로 나가지 않는다", () => {
    expect(
      nextLeaveCountdown(
        [leave("r", "2026-08-18", "2026-08-19", "rejected")],
        TODAY,
      ),
    ).toBeNull();
    expect(
      nextLeaveCountdown(
        [leave("c", "2026-08-18", "2026-08-19", "cancelled")],
        TODAY,
      ),
    ).toBeNull();
  });

  it("초안이 더 가까워도 세는 휴가를 고른다", () => {
    const result = nextLeaveCountdown(
      [
        leave("draft", "2026-08-18", "2026-08-19", "draft"),
        leave("real", "2026-08-25", "2026-08-26", "approved"),
      ],
      TODAY,
    );
    expect(result?.leave.id).toBe("real");
    expect(result?.days).toBe(9);
  });

  it("신청함·확정도 센다", () => {
    for (const status of ["requested", "approved", "completed"] as const) {
      const result = nextLeaveCountdown(
        [leave("a", "2026-08-20", "2026-08-22", status)],
        TODAY,
      );
      expect(result?.days).toBe(4);
    }
  });

  it("원본 배열을 건드리지 않는다", () => {
    const input = [
      leave("b", "2026-09-01", "2026-09-02"),
      leave("a", "2026-08-20", "2026-08-22"),
    ];
    nextLeaveCountdown(input, TODAY);
    expect(input.map((l) => l.id)).toEqual(["b", "a"]);
  });
});
