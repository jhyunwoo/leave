/**
 * 바텀시트 디텐트(스냅 포인트) 정의와, 그 높이를 RN 콘텐츠에 못 박는 규칙.
 * 세 플랫폼 구현(`native-bottom-sheet.{ios,native,}.tsx`)이 함께 쓴다.
 */

export type SnapPoint =
  "half" | "full" | { fraction: number } | { height: number };

/**
 * 시트 호스트가 시트 높이를 정하는 방식. 이 차이가 **무엇을** 못 박느냐를 가른다.
 *
 * `detent`  : 시트가 디텐트만큼의 높이를 스스로 갖는다. iOS SwiftUI `.sheet` +
 *             `presentationDetents`가 그렇다.
 * `content` : 시트가 콘텐츠 높이만큼만 커진다. RN 쪽이 높이를 정해주지 않으면
 *             시트가 콘텐츠를 따라 자란다. 안드로이드 Material `ModalBottomSheet`
 *             (디텐트 숫자를 아예 보지 않는다)와 웹 구현이 그렇다.
 */
export type SheetHostSizing = "detent" | "content";

/**
 * 실측값이 오기 전에 디텐트 숫자에서 뺄 여유분(pt).
 *
 * 디텐트 숫자만큼이 RN 표면으로 오지 않는다. iOS 26 시트는 화면 가장자리에서 8pt
 * 떠 있는 카드로 그려지고, 그 안에서 표면은 아래 안전 영역(아이폰 홈 인디케이터
 * 기준 33pt) 위에서 끝난다 — 실측(393x852)에서 디텐트 639pt의 표면은 598pt였다.
 *
 * 그 41pt보다 넉넉하게 빼는 이유는 틀리는 방향을 고르기 위해서다. 크게 잡으면 그
 * 차이가 시트 밖에 남아 아래쪽이 잘리지만(`35f58ac`), 작게 잡으면 첫 프레임에
 * 표면이 조금 짧을 뿐이고 그 자리는 `presentationBackground`가 같은 색으로
 * 칠하므로 보이지 않는다. 다음 프레임에는 실측값으로 정확히 맞는다.
 */
const DETENT_SURFACE_SLACK = 64;

/**
 * 콘텐츠가 요청한 높이에서 거꾸로 잡은 디텐트 높이(pt).
 *
 * 창 높이의 몇 퍼센트로 디텐트를 고정하면, 콘텐츠가 그 안에 들어가는지는 운에
 * 맡기게 된다. 날짜 상세 시트가 그랬다 — 창의 75%(393x852에서 639pt)를 줬지만 그
 * 중 RN 표면으로 오는 건 588pt뿐이고, 명단도 일정도 없는 **가장 짧은** 날조차 본문이
 * 589pt였다. 그래서 맨 아래 버튼 줄이 늘 접히는 자리에 걸쳤고, 시트 안에 아직
 * 57pt가 남은 채로 캡슐이 반 잘려 보였다.
 *
 * 콘텐츠 높이를 받아 시트를 거기에 맞추면 그 우연이 사라진다. `detent` 호스트에는
 * 시트가 표면에 내주지 않는 몫(`DETENT_SURFACE_SLACK`)을 얹어 달라고 해야 한다 —
 * `content` 호스트는 디텐트 숫자가 곧 시트 높이라 얹으면 빈 자리만 그만큼 생긴다.
 *
 * 하한이 있는 이유는 로딩이다. 데이터가 오기 전 본문은 스피너 하나뿐이라, 하한이
 * 없으면 시트가 손바닥만 하게 열렸다가 곧바로 커진다. 상한은 콘텐츠가 아무리 길어도
 * 시트 위로 달력이 조금은 보이게 남겨 두는 선이다.
 */
export function fittedDetentHeight(
  contentHeight: number | null | undefined,
  sizing: SheetHostSizing,
  bounds: { min: number; max: number },
): number {
  const max = Math.max(bounds.min, bounds.max);
  // 아직 재지 못했다. 하한으로 열고, 실측이 오면 그때 늘린다.
  if (contentHeight == null || !(contentHeight > 0)) return bounds.min;
  const slack = sizing === "detent" ? DETENT_SURFACE_SLACK : 0;
  return Math.min(max, Math.max(bounds.min, Math.ceil(contentHeight + slack)));
}

/** 스냅 포인트가 절대 높이 하나뿐일 때 그 높이. 아니면 null. */
function soleDetentHeight(
  snapPoints: readonly SnapPoint[] | undefined,
): number | null {
  if (snapPoints?.length !== 1) return null;
  const only = snapPoints[0]!;
  return typeof only === "object" && "height" in only ? only.height : null;
}

/**
 * 시트 안 RN 트리에 못 박을 높이(pt). 못 박을 수 없으면 null.
 *
 * **못 박는 일 자체는 두 호스트 모두에 필요하다.** 시트 안 RN 트리는 높이를
 * 시트에서 물려받지 못한다 — 호스트가 잰 크기를 Yoga로 되돌려받을 뿐이라, 정해진
 * 높이가 없으면 루트가 콘텐츠를 따라 자란다. 그러면 `SheetScaffold`의 ScrollView는
 * 자기 안에 다 들어간다고 보고 스크롤을 만들지 않는데 정작 화면에는 시트 높이만큼만
 * 보인다 — 시트 밖으로 밀려난 아래쪽(하단 동작 버튼)에 영영 닿지 못한다.
 *
 * 한동안 `detent` 호스트에는 못 박지 않았는데, 그 규칙이 이 버그를 되살렸다.
 * SwiftUI의 유연 프레임(`frame(maxHeight: .infinity)`)은 `max(자식, 제안된 높이)`라
 * 짧은 콘텐츠를 시트까지 **늘려 주기만** 하고 긴 콘텐츠를 깎지는 않는다.
 *
 * 다른 것은 **무엇을** 못 박느냐다. `content` 호스트에서는 디텐트 숫자가 곧 시트
 * 높이다. `detent` 호스트에서는 아니다 — 시트가 내주는 높이는 디텐트 숫자보다
 * 작다(`DETENT_SURFACE_SLACK` 주석). 그래서 호스트가 `onGeometryChange`로 알려준
 * 실제 높이를 받아 그 값을 쓰고, 오기 전까지만 보수적으로 어림잡는다. 호스트가
 * 자기 높이를 알려주는 쪽이 언제나 맞다.
 *
 * `fraction`으로는 어느 쪽도 계산할 수 없다 — 기준이 되는 높이가 플랫폼마다 다르다
 * (SwiftUI는 시트가 쓸 수 있는 높이, 웹은 창 높이). 스크롤이 필요한 시트에는
 * `{ height }`를 쓴다. 디텐트가 없는 시트(`fitToContents`)는 콘텐츠 높이로 커져야
 * 하고, 디텐트가 여럿인 시트는 사용자가 끌어 높이를 바꾸므로 둘 다 못 박지 않는다.
 *
 * @param measuredHeight `detent` 호스트가 알려준, 시트가 RN 표면에 실제로 내준 높이.
 *   디텐트 숫자보다 큰 값은 받지 않는다 — 이 시트가 내준 높이일 수 없다. 지난 표시
 *   때의 값이 남았거나(창이 그 사이 작아졌다) 콘텐츠 길이에 휘둘린 값이고, 그런 값을
 *   못 박으면 그 차이만큼이 시트 밖에 남아 아래가 다시 잘린다. 버리면 어림값으로
 *   돌아가고, 어림값은 시트보다 짧으므로 다음 실측이 제 높이를 알려 준다.
 */
export function pinnedSheetHeight(
  snapPoints: readonly SnapPoint[] | undefined,
  sizing: SheetHostSizing,
  measuredHeight?: number | null,
): number | null {
  const detent = soleDetentHeight(snapPoints);
  if (detent === null) return null;
  if (sizing === "content") return detent;
  if (
    measuredHeight != null &&
    measuredHeight > 0 &&
    measuredHeight <= detent
  ) {
    return Math.round(measuredHeight);
  }
  return Math.max(0, detent - DETENT_SURFACE_SLACK);
}
