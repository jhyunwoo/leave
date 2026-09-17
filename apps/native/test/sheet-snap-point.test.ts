import { describe, expect, it } from "vitest";
import { pinnedSheetHeight } from "../src/components/sheet-snap-point";

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
