/**
 * 위젯 설정 저장소 — 웹(Expo web 타깃) 구현.
 * `.native.ts` 짝이 Metro의 플랫폼 확장자 규칙에 따라 기기에서 선택된다.
 *
 * 웹에는 홈 화면 위젯이 없지만 설정 화면은 그대로 열린다. 브라우저 검증에서
 * 고른 값이 새로고침 뒤에도 남아야 화면을 제대로 확인할 수 있어 localStorage를 쓴다.
 */

export interface WidgetStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const widgetStorage: WidgetStorage = {
  getItem: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key, value) => {
    globalThis.localStorage?.setItem(key, value);
  },
};
