import { describe, expect, it } from "vitest";
import { resolveWindowSizeClass } from "../src/window-size-class";

/**
 * 폭만 보면 **가로로 돌린 휴대폰이 태블릿으로 읽힌다.** iOS 휴대폰은 세로 고정이라
 * 그 화면이 없지만 안드로이드는 자유 회전이라 실제로 나온다 — 달력에 보조 패널이
 * 붙고 날짜 시트가 창 높이의 75%(≈270pt)로 찌그러졌다.
 */
describe("창 크기 클래스", () => {
  it("휴대폰 세로는 compact", () => {
    expect(resolveWindowSizeClass(390, 844)).toBe("compact");
    expect(resolveWindowSizeClass(360, 800)).toBe("compact");
  });

  it("가로로 돌린 휴대폰도 compact다", () => {
    expect(resolveWindowSizeClass(844, 390)).toBe("compact");
    expect(resolveWindowSizeClass(800, 360)).toBe("compact");
    // 폴더블을 접은 뒤 가로로 돌린 극단적인 비율도 같다.
    expect(resolveWindowSizeClass(1080, 400)).toBe("compact");
  });

  it("태블릿 세로는 medium", () => {
    expect(resolveWindowSizeClass(834, 1112)).toBe("medium");
    expect(resolveWindowSizeClass(768, 1024)).toBe("medium");
  });

  it("태블릿 가로는 expanded로 남는다", () => {
    expect(resolveWindowSizeClass(1194, 834)).toBe("expanded");
    expect(resolveWindowSizeClass(1280, 800)).toBe("expanded");
    expect(resolveWindowSizeClass(1024, 768)).toBe("expanded");
  });

  it("iPad Split View의 좁은 칸은 compact", () => {
    expect(resolveWindowSizeClass(320, 1112)).toBe("compact");
  });

  it("짧은 변 경계", () => {
    expect(resolveWindowSizeClass(1024, 479)).toBe("compact");
    expect(resolveWindowSizeClass(1024, 480)).toBe("expanded");
  });

  it("높이를 모르면 폭만으로 판단한다 (컨테이너 폭 측정)", () => {
    expect(resolveWindowSizeClass(390)).toBe("compact");
    expect(resolveWindowSizeClass(800)).toBe("medium");
    expect(resolveWindowSizeClass(1200)).toBe("expanded");
  });
});
