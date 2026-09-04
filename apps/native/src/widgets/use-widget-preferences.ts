/**
 * 위젯 설정을 화면과 동기화 컴포넌트가 함께 보는 훅.
 *
 * 설정 화면에서 바꾼 값이 같은 실행 중에 위젯 동기화까지 바로 닿아야 하므로,
 * 저장소를 다시 읽지 않고 모듈이 들고 있는 값을 구독한다(preferences.ts).
 */

import { useEffect, useSyncExternalStore } from "react";
import {
  getWidgetPreferences,
  loadWidgetPreferences,
  subscribeWidgetPreferences,
  type WidgetPreferences,
} from "./preferences";

export function useWidgetPreferences(): WidgetPreferences {
  useEffect(() => {
    void loadWidgetPreferences();
  }, []);

  return useSyncExternalStore(
    subscribeWidgetPreferences,
    getWidgetPreferences,
    getWidgetPreferences,
  );
}
