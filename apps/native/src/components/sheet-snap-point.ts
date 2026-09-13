/**
 * 바텀시트 디텐트(스냅 포인트) 정의와, 그 높이를 RN 콘텐츠에 못 박는 규칙.
 * 세 플랫폼 구현(`native-bottom-sheet.{ios,native,}.tsx`)이 함께 쓴다.
 */

export type SnapPoint =
  "half" | "full" | { fraction: number } | { height: number };

/**
 * 시트 호스트가 시트 높이를 정하는 방식. 이 차이가 아래 규칙을 가른다.
 *
 * `detent`  : 시트가 디텐트만큼의 높이를 스스로 갖고, 그 높이를 시트 안 RN 트리에
 *             내려준다. iOS SwiftUI `.sheet` + `presentationDetents`가 그렇다 —
 *             `RNHostView`가 SwiftUI가 잰 크기를 Yoga 노드에 그대로 써 준다.
 * `content` : 시트가 콘텐츠 높이만큼만 커진다. RN 쪽이 높이를 정해주지 않으면
 *             시트가 콘텐츠를 따라 자란다. 안드로이드 Material `ModalBottomSheet`
 *             (디텐트 숫자를 아예 보지 않는다)와 웹 구현이 그렇다.
 */
export type SheetHostSizing = "detent" | "content";

/**
 * 시트 안 RN 트리에 못 박을 높이(pt). 못 박지 않아야 하거나 못 박을 수 없으면 null.
 *
 * `content` 호스트에서는 못 박아야 한다. 시트가 콘텐츠 높이로 자라므로, RN 루트가
 * 콘텐츠 높이까지 커지면 안쪽 ScrollView는 자기 안에 다 들어간다고 보고 스크롤을
 * 만들지 않는데 정작 화면에는 시트 높이만큼만 보인다 — 시트 밖으로 밀려난 아래쪽
 * (하단 동작 버튼)에 영영 닿지 못한다. 디텐트를 절대 높이 하나로 주고 RN 콘텐츠도
 * 같은 높이로 못 박으면 둘이 어긋나지 않는다.
 *
 * `detent` 호스트에서는 **못 박으면 안 된다.** 시트가 내주는 높이는 디텐트 숫자와
 * 같지 않다 — iOS 26의 시트는 화면 가장자리에서 8pt 떠 있는 카드로 그려지고, 그
 * 안에서 RN 표면은 홈 인디케이터 안전 영역 위에서 끝난다. 그래서 창 높이의 75%로
 * 계산한 639pt를 못 박았더니 실제로 보이는 598pt보다 41pt 길어져, 스크롤 뷰포트의
 * 아래쪽 41pt가 영영 화면 밖에 남았다(하단 버튼이 잘려 보인 원인). 호스트가 자기
 * 높이를 알려주는 쪽이 언제나 맞으므로, 그 값을 그대로 쓴다.
 *
 * `fraction`으로는 어느 쪽도 계산할 수 없다 — 기준이 되는 높이가 플랫폼마다 다르다
 * (SwiftUI는 시트가 쓸 수 있는 높이, 웹은 창 높이). 스크롤이 필요한 `content`
 * 시트에는 `{ height }`를 쓴다.
 */
export function pinnedSheetHeight(
  snapPoints: readonly SnapPoint[] | undefined,
  sizing: SheetHostSizing,
): number | null {
  if (sizing === "detent") return null;
  if (snapPoints?.length !== 1) return null;
  const only = snapPoints[0]!;
  return typeof only === "object" && "height" in only ? only.height : null;
}
