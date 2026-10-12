/**
 * 라우트 `외부 캘린더` → `screens/calendar-export.tsx`.
 * 프로필 탭에서 들어오고, 탭 밖의 최상위 라우트라 어디서 열어도 같은 화면이다.
 */
import { CalendarExportScreen } from "@/screens/calendar-export";

export default function CalendarExportRoute() {
  return <CalendarExportScreen />;
}
