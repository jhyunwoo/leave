import { describe, expect, it } from "vitest";
import { pinnedSheetHeight } from "../src/components/sheet-snap-point";

/**
 * 시트 높이를 RN 콘텐츠에 못 박는 일은 **호스트가 시트를 콘텐츠 높이로 재는
 * 경우에만** 맞다. 디텐트로 높이가 정해지는 호스트(iOS SwiftUI 시트)에 못 박으면
 * 시트가 실제로 내준 높이와 어긋나, 시트 아래쪽이 잘리거나 비어 보인다.
 */
describe("시트 높이를 RN 콘텐츠에 못 박는 규칙", () => {
  it("콘텐츠 높이로 커지는 호스트는 절대 높이를 못 박는다", () => {
    expect(pinnedSheetHeight([{ height: 633 }], "content")).toBe(633);
  });

  it("디텐트로 높이가 정해지는 호스트에는 못 박지 않는다", () => {
    expect(pinnedSheetHeight([{ height: 633 }], "detent")).toBeNull();
  });

  it("절대 높이가 아니면 못 박을 수 없다", () => {
    expect(pinnedSheetHeight(["half"], "content")).toBeNull();
    expect(pinnedSheetHeight(["full"], "content")).toBeNull();
    expect(pinnedSheetHeight([{ fraction: 0.75 }], "content")).toBeNull();
  });

  it("디텐트가 없거나 여럿이면 못 박을 수 없다", () => {
    expect(pinnedSheetHeight(undefined, "content")).toBeNull();
    expect(pinnedSheetHeight([], "content")).toBeNull();
    expect(pinnedSheetHeight([{ height: 320 }, "full"], "content")).toBeNull();
  });
});
