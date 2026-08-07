/**
 * 라우트 `달력 탭` → `screens/calendar/index.tsx`.
 *
 * expo-router는 파일 경로가 곧 URL이다. 화면 구현을 screens/ 아래에 두고
 * 여기서는 연결만 하면, 화면을 다른 경로에 재사용하거나 경로를 바꿀 때
 * 화면 코드를 건드리지 않아도 된다.
 */

import { CalendarScreen } from "@/screens/calendar";

export default function CalendarRoute() {
  return <CalendarScreen />;
}
