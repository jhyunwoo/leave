import { describe, expect, it } from "vitest";
import { nearestGrabTarget } from "../src/components/calendar-drag/grab-target";

// 92px 칸 안의 실제 배치와 비슷하게 잡는다 — 날짜 줄(6~32), 재원 칩(35~49),
// 개인 일정 알약(52~66), 그 아래 출타율 알약과 여백.
const leave = { subject: "leave" as const, rect: { y: 35, height: 14 } };
const personal = { subject: "personal" as const, rect: { y: 52, height: 14 } };

describe("nearestGrabTarget", () => {
  it("칩 위를 누르면 칩을 집는다", () => {
    expect(nearestGrabTarget(40, [leave, personal])).toBe("leave");
  });

  it("알약 위를 누르면 알약을 집는다", () => {
    expect(nearestGrabTarget(60, [leave, personal])).toBe("personal");
  });

  it("둘 사이에서는 가까운 쪽을 집는다", () => {
    expect(nearestGrabTarget(50, [leave, personal])).toBe("leave");
    expect(nearestGrabTarget(51, [leave, personal])).toBe("personal");
  });

  it("날짜 숫자 위(칸 위쪽 빈 자리)에서는 위에 있는 칩을 집는다", () => {
    expect(nearestGrabTarget(10, [leave, personal])).toBe("leave");
  });

  it("칸 아래 빈 자리에서는 아래에 있는 알약을 집는다", () => {
    expect(nearestGrabTarget(88, [leave, personal])).toBe("personal");
  });

  it("거리가 같으면 칸에서 위에 그려진 쪽이 이긴다", () => {
    // 칩 아래 모서리(49)와 알약 위 모서리(52)에서 같은 거리.
    expect(nearestGrabTarget(50.5, [leave, personal])).toBe("leave");
  });

  it("후보가 하나면 어디를 눌러도 그것을 집는다", () => {
    expect(nearestGrabTarget(0, [personal])).toBe("personal");
    expect(nearestGrabTarget(91, [personal])).toBe("personal");
  });

  it("후보가 없으면 아무것도 집지 않는다", () => {
    expect(nearestGrabTarget(40, [])).toBeNull();
  });

  it("레이아웃이 아직 없는 후보는 건너뛴다", () => {
    expect(
      nearestGrabTarget(40, [{ subject: "leave", rect: null }, personal]),
    ).toBe("personal");
  });

  it("레이아웃이 하나도 없으면 첫 후보로 떨어진다", () => {
    expect(
      nearestGrabTarget(40, [
        { subject: "leave", rect: null },
        { subject: "personal", rect: null },
      ]),
    ).toBe("leave");
  });
});
