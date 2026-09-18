/**
 * react-navigation에게 우리 팔레트를 알려주는 테마.
 *
 * 사용처: app/_layout.tsx가 루트 내비게이터를 이 값으로 감싼다.
 *
 * ## 왜 필요한가
 *
 * expo-router는 테마를 주지 않으면 `DefaultTheme`(라이트 고정)을 쓴다. 그 색들은
 * 화면 옵션이 값을 비워 둔 자리를 메우는 기본값이라, 앱이 다크여도 **라이트 값이
 * 그대로 나온다.** 실제로 그렇게 새어 나온 자리:
 *
 *  - `colors.card` — 헤더 배경. `headerTransparent: false`이면서 `headerStyle`에
 *    배경색을 적지 않은 화면이 이 값을 쓴다. 달력 탭의 개인 일정·부대 일정 시트가
 *    그랬다(iOS의 다른 화면은 모두 투명 헤더라 시스템 재질을 쓴다). 다크모드에서
 *    시트 위쪽에 흰 띠가 남은 원인이 이것이다.
 *  - `colors.background` — 화면 스택 컨테이너 배경. 모달 전환 중 잠깐 드러난다.
 *  - `colors.text` — `headerTintColor`도 `headerTitleStyle.color`도 없을 때의 제목색.
 *
 * 색보다 더 넓게 퍼지는 것은 `dark` 플래그다. expo-router는 이 값을 그대로
 * `experimental_userInterfaceStyle`로 내려보내고, react-native-screens는 그것을
 * `navigationBar.overrideUserInterfaceStyle`에 적는다
 * (`RNSScreenStackHeaderConfig.mm`). 곧 테마를 주지 않으면 **앱의 모든 내비게이션
 * 바가 라이트로 고정된다.** 투명 헤더는 아무것도 그리지 않아 티가 나지 않았고,
 * 위의 두 시트만 불투명 헤더라 그 고정이 흰 바로 드러났다.
 *
 * 화면마다 `headerStyle`을 하나씩 적어 막을 수도 있지만, 그러면 옵션을 빠뜨린
 * 다음 화면에서 같은 일이 다시 난다. 게다가 `dark`는 화면 옵션으로 덮을 수도 없다.
 * 기본값 자체를 스킴에 맞춰 두는 편이 낫다.
 *
 * `theme.ts`를 값으로 부르지 않는 순수 모듈이다(`balance-tone.ts`와 같은 이유 —
 * `apps/native/test`는 node 환경이라 react-native를 불러올 수 없다).
 */

import type { Theme } from "./theme";

/** react-navigation의 `Theme["colors"]`와 같은 모양. */
export type NavigationColors = {
  primary: string;
  background: string;
  card: string;
  text: string;
  border: string;
  notification: string;
};

/**
 * 팔레트를 react-navigation의 색 이름으로 옮긴다.
 *
 * 라이트에서는 지금 나오는 값과 사실상 같은 색이 되도록 짝지었다(card ↔ 흰색,
 * background ↔ 옅은 회색). 곧 이 테마는 다크에서만 화면을 바꾼다.
 *
 * `card`가 `canvas`인 것은 안드로이드 헤더가 이미 쓰는 색과 같다
 * (탭 스택들의 `_layout.tsx`가 정하는 `headerStyle`). 시트 본문은 `canvasSoft`라 헤더가
 * 한 톤 밝게 떠 보이는데, 그게 시스템 시트의 위계와 같은 방향이다.
 */
export function navigationTheme(theme: Theme): {
  dark: boolean;
  colors: NavigationColors;
} {
  return {
    dark: theme.scheme === "dark",
    colors: {
      primary: theme.colors.brand,
      background: theme.colors.canvasSoft,
      card: theme.colors.canvas,
      text: theme.colors.ink,
      border: theme.colors.hairline,
      notification: theme.colors.negative,
    },
  };
}
