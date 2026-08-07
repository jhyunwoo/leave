/**
 * 라우트 `/unit-manage (그룹 관리 시트)` → `screens/unit-manage.tsx`.
 *
 * expo-router는 파일 경로가 곧 URL이다. 화면 구현을 screens/ 아래에 두고
 * 여기서는 연결만 하면, 화면을 다른 경로에 재사용하거나 경로를 바꿀 때
 * 화면 코드를 건드리지 않아도 된다.
 */

import { UnitManageScreen } from "@/screens/unit-manage";

export default function UnitManageRoute() {
  return <UnitManageScreen />;
}
