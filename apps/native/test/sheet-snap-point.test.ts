import { describe, expect, it } from "vitest";
import {
  fittedDetentHeight,
  pinnedSheetHeight,
} from "../src/components/sheet-snap-point";

/**
 * 시트 안 RN 트리에는 **언제나** 높이를 못 박아야 한다. 안 박으면 루트가 콘텐츠를
 * 따라 자라고, 그러면 안쪽 ScrollView가 "다 들어간다"고 보아 스크롤을 만들지
 * 않는다 — 시트 밖으로 밀려난 아래쪽 버튼에 영영 닿지 못한다.
 *
 * 무엇을 못 박느냐가 호스트마다 다르다. 콘텐츠 높이로 커지는 호스트는 디텐트
 * 숫자가 곧 시트 높이지만, 디텐트 호스트는 그 숫자만큼을 RN 표면에 그대로 주지
 * 않는다. 그쪽은 호스트가 실제로 내준 높이를 되돌려 받아 그 값을 쓴다.
 */
describe("시트 높이를 RN 콘텐츠에 못 박는 규칙", () => {
  it("콘텐츠 높이로 커지는 호스트는 디텐트 숫자를 그대로 못 박는다", () => {
    expect(pinnedSheetHeight([{ height: 633 }], "content")).toBe(633);
  });

  it("콘텐츠 호스트는 실측값이 와도 디텐트 숫자를 쓴다", () => {
    expect(pinnedSheetHeight([{ height: 633 }], "content", 598)).toBe(633);
  });

  it("디텐트 호스트에도 못 박는다", () => {
    expect(pinnedSheetHeight([{ height: 639 }], "detent")).not.toBeNull();
  });

  it("실측 전 어림값은 디텐트보다 작다", () => {
    // 디텐트 숫자보다 크게 잡으면 그 차이만큼이 시트 밖에 남아 잘린다(35f58ac).
    // 실측(393x852)에서 디텐트 639pt가 RN 표면에 내준 높이는 598pt였다.
    const pinned = pinnedSheetHeight([{ height: 639 }], "detent");
    expect(pinned).not.toBeNull();
    expect(pinned!).toBeLessThanOrEqual(598);
  });

  it("호스트가 알려준 높이가 오면 그 값을 그대로 쓴다", () => {
    expect(pinnedSheetHeight([{ height: 639 }], "detent", 598)).toBe(598);
    expect(pinnedSheetHeight([{ height: 639 }], "detent", 597.6)).toBe(598);
  });

  it("쓸 수 없는 실측값은 어림값으로 되돌린다", () => {
    const fallback = pinnedSheetHeight([{ height: 639 }], "detent");
    expect(pinnedSheetHeight([{ height: 639 }], "detent", null)).toBe(fallback);
    expect(pinnedSheetHeight([{ height: 639 }], "detent", 0)).toBe(fallback);
    expect(pinnedSheetHeight([{ height: 639 }], "detent", -1)).toBe(fallback);
  });

  it("디텐트보다 큰 실측값은 이 시트의 것이 아니므로 버린다", () => {
    // 콘텐츠 길이에 휘둘린 값이거나 창이 더 컸던 지난 표시 때의 값이다. 그대로
    // 못 박으면 그 차이만큼이 시트 밖에 남아 아래쪽 버튼이 다시 잘린다.
    const fallback = pinnedSheetHeight([{ height: 639 }], "detent");
    expect(pinnedSheetHeight([{ height: 639 }], "detent", 917)).toBe(fallback);
    expect(pinnedSheetHeight([{ height: 639 }], "detent", 640)).toBe(fallback);
    expect(pinnedSheetHeight([{ height: 639 }], "detent", 639)).toBe(639);
  });

  it("절대 높이가 아니면 못 박을 수 없다", () => {
    expect(pinnedSheetHeight(["half"], "content")).toBeNull();
    expect(pinnedSheetHeight(["full"], "content")).toBeNull();
    expect(pinnedSheetHeight([{ fraction: 0.75 }], "content")).toBeNull();
    expect(pinnedSheetHeight([{ fraction: 0.75 }], "detent", 598)).toBeNull();
  });

  it("디텐트가 없거나 여럿이면 못 박을 수 없다", () => {
    // 디텐트를 주지 않은 시트는 콘텐츠 높이로 커져야 하고(fitToContents),
    // 여럿이면 사용자가 끌어 높이를 바꾸므로 한 값으로 묶으면 안 된다.
    expect(pinnedSheetHeight(undefined, "content")).toBeNull();
    expect(pinnedSheetHeight([], "content")).toBeNull();
    expect(pinnedSheetHeight(undefined, "detent", 598)).toBeNull();
    expect(pinnedSheetHeight([], "detent", 598)).toBeNull();
    expect(pinnedSheetHeight([{ height: 320 }, "full"], "content")).toBeNull();
    expect(
      pinnedSheetHeight([{ height: 320 }, "full"], "detent", 598),
    ).toBeNull();
  });
});

/**
 * 시트 높이를 창의 몇 퍼센트로 고정하면, 콘텐츠가 그 안에 들어가는지는 운이 된다.
 * 날짜 상세 시트가 그랬다 — 창의 75%를 줬는데 명단도 일정도 없는 가장 짧은 날조차
 * 본문이 시트보다 길어, 맨 아래 캡슐이 늘 접히는 자리에 걸쳐 반이 잘렸다.
 */
describe("콘텐츠에 맞춘 디텐트 높이", () => {
  const bounds = { min: 639, max: 784 };

  it("아직 재지 못했으면 하한으로 연다", () => {
    // 본문이 스피너 하나인 로딩 중에 시트가 손바닥만 하게 열리면 안 된다.
    expect(fittedDetentHeight(null, "detent", bounds)).toBe(639);
    expect(fittedDetentHeight(undefined, "content", bounds)).toBe(639);
    expect(fittedDetentHeight(0, "detent", bounds)).toBe(639);
    expect(fittedDetentHeight(-1, "detent", bounds)).toBe(639);
  });

  it("디텐트 호스트에는 시트가 표면에 내주지 않는 몫까지 더해 청한다", () => {
    // 디텐트 숫자만큼이 RN 표면으로 오지 않는다(DETENT_SURFACE_SLACK).
    const fitted = fittedDetentHeight(660, "detent", bounds);
    expect(fitted).toBeGreaterThan(660);
    expect(fitted).toBeLessThanOrEqual(784);
  });

  it("콘텐츠 호스트에는 더하지 않는다 — 디텐트 숫자가 곧 시트 높이다", () => {
    expect(fittedDetentHeight(660, "content", bounds)).toBe(660);
    expect(fittedDetentHeight(659.2, "content", bounds)).toBe(660);
  });

  it("한계 밖으로는 나가지 않는다", () => {
    expect(fittedDetentHeight(100, "detent", bounds)).toBe(639);
    expect(fittedDetentHeight(100, "content", bounds)).toBe(639);
    expect(fittedDetentHeight(5000, "detent", bounds)).toBe(784);
    expect(fittedDetentHeight(5000, "content", bounds)).toBe(784);
  });

  it("한계가 뒤집혀 있어도 상한이 하한을 넘지 않는다", () => {
    expect(fittedDetentHeight(900, "content", { min: 700, max: 500 })).toBe(
      700,
    );
  });

  it("짧은 날의 본문이 시트 안에 들어간다", () => {
    // 393x852에서 실측: 헤더 71pt + 본문 557pt. 예전 고정 높이(639pt)가 표면에
    // 내주던 588pt로는 모자라 하단 캡슐이 반 잘렸다.
    const fitted = fittedDetentHeight(71 + 557, "detent", {
      min: 639,
      max: 784,
    });
    // 이 디텐트가 표면에 내주는 높이(실측 기준 약 51pt를 뺀 값)가 본문을 담는다.
    expect(fitted - 51).toBeGreaterThanOrEqual(71 + 557);
  });
});
