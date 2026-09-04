/**
 * 홈 화면 위젯 동기화 — 웹(Expo web 타깃)에는 위젯이 없다.
 * `.native.tsx` 짝이 기기에서 선택된다(Metro 플랫폼 확장자).
 */

import type { WidgetState } from "./payload";

export function WidgetSync(_props: { state: WidgetState }) {
  return null;
}
