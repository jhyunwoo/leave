/**
 * 라우트 `위젯 설정` → `screens/widget-settings.tsx`.
 * 프로필 탭에서 들어오고, 탭 밖의 최상위 라우트라 어디서 열어도 같은 화면이다.
 */

import { WidgetSettingsScreen } from "@/screens/widget-settings";

export default function WidgetSettingsRoute() {
  return <WidgetSettingsScreen />;
}
