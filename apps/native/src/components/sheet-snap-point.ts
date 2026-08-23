/**
 * 바텀시트 디텐트(스냅 포인트) 정의와, 그 높이를 RN 콘텐츠에 못 박는 규칙.
 * 세 플랫폼 구현(`native-bottom-sheet.{ios,native,}.tsx`)이 함께 쓴다.
 */

export type SnapPoint =
  "half" | "full" | { fraction: number } | { height: number };

/**
 * 시트 안 RN 트리에 못 박을 높이(pt). 못 박을 수 없으면 null.
 *
 * 시트 안의 RN 트리는 자기 높이를 시트에서 물려받지 못한다. 세 구현 모두 호스트가
 * 잰 크기를 Yoga로 되돌려주는 구조라, 콘텐츠가 시트보다 길면 RN 루트가 콘텐츠
 * 높이까지 자란다. 그러면 안쪽 ScrollView는 자기 안에 다 들어간다고 보고 스크롤을
 * 만들지 않는데, 정작 화면에는 시트 높이만큼만 보인다 — 시트 밖으로 밀려난 아래쪽
 * (하단 동작 버튼)에 영영 닿지 못한다. `form-sheet.tsx`가 폼에 바텀시트를 쓰지
 * 않는 이유와 같은 문제다.
 *
 * 그래서 디텐트를 절대 높이 하나로 준 시트는 RN 콘텐츠도 같은 높이로 못 박는다.
 * 둘이 같은 수를 쓰면 RN 루트가 시트를 넘지 않고, 안쪽 스크롤이 바닥까지 닿는다.
 *
 * `fraction`으로는 이 계산을 할 수 없다 — 기준이 되는 높이가 플랫폼마다 다르다
 * (SwiftUI는 시트가 쓸 수 있는 높이, 웹은 창 높이). 스크롤이 필요한 시트에는
 * `{ height }`를 쓴다.
 */
export function pinnedSheetHeight(
  snapPoints: readonly SnapPoint[] | undefined,
): number | null {
  if (snapPoints?.length !== 1) return null;
  const only = snapPoints[0]!;
  return typeof only === "object" && "height" in only ? only.height : null;
}
