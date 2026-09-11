/**
 * 창 크기 → 크기 클래스. `react-native`도 `@/theme`도 부르지 않는 순수 모듈이다.
 *
 * 화면 부품(`adaptive.tsx`)에서 떼어 둔 이유는 두 가지다 — 이 판단을 단위 테스트로
 * 고정하려면 RN을 불러올 수 없고(`apps/native/test`는 node 환경이다), 판단 자체가
 * 창 크기 두 숫자에서 나오는 순수 함수라 화면을 필요로 하지 않는다.
 */

export type WindowSizeClass = "compact" | "medium" | "expanded";

/**
 * 값은 DESIGN.md의 반응형 표(Mobile <768 / Tablet 768–1023 / Desktop ≥1024)와
 * 맞춘다. 웹과 네이티브가 같은 폭에서 같은 판단을 하도록.
 */
export const breakpoints = { medium: 768, expanded: 1024 } as const;

/**
 * 짧은 변이 이보다 좁은 창은 폭이 아무리 넓어도 휴대폰이다.
 *
 * 폭만 보면 **가로로 돌린 휴대폰이 태블릿으로 읽힌다.** 800×360 창은 `medium`이 되어
 * 달력에 보조 패널이 붙고, 날짜 시트 높이가 `windowHeight * 0.75` = 270pt로
 * 찌그러진다. iOS 휴대폰은 세로 고정이라 이 경우가 없지만 **안드로이드는 자유 회전**
 * 이라(app.json의 `orientation: "default"`) 실제로 그 화면이 나온다.
 *
 * 안드로이드의 `sw600dp`와 같은 발상이되 기준을 더 낮게 잡았다 — iPad 가로
 * (1194×834)와 안드로이드 태블릿 가로(1280×800)는 그대로 `expanded`여야 한다.
 */
const PHONE_SHORT_SIDE = 480;

/**
 * 크기 클래스.
 *
 *   compact  : < 768, 또는 짧은 변이 휴대폰 폭인 창(가로로 돌린 휴대폰)
 *   medium   : 768–1023  태블릿 세로, 안드로이드 멀티윈도우 절반
 *   expanded : ≥ 1024  태블릿 가로, iPad 12.9" 세로, 데스크톱 창
 *
 * `height`를 모르는 호출(컨테이너 폭만 재는 `useMeasuredSizeClass`)은 폭만으로
 * 판단한다 — 시트 안에서는 높이가 창 높이와 무관하게 바뀌어 짧은 변 규칙의 근거가
 * 되지 못한다.
 */
export function resolveWindowSizeClass(
  width: number,
  height = Infinity,
): WindowSizeClass {
  if (Math.min(width, height) < PHONE_SHORT_SIDE) return "compact";
  if (width >= breakpoints.expanded) return "expanded";
  if (width >= breakpoints.medium) return "medium";
  return "compact";
}
