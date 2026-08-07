/**
 * 라우트 `알림 탭` → `screens/notifications.tsx`.
 *
 * expo-router는 파일 경로가 곧 URL이다. 화면 구현을 screens/ 아래에 두고
 * 여기서는 연결만 하면, 화면을 다른 경로에 재사용하거나 경로를 바꿀 때
 * 화면 코드를 건드리지 않아도 된다.
 */

import { NotificationsScreen } from "@/screens/notifications";

export default function NotificationsRoute() {
  return <NotificationsScreen />;
}
