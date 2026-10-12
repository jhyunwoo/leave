/**
 * 기기 캘린더 내보내기 설정 저장소 — 웹(Expo web 타깃) 구현.
 * 웹에는 기기 캘린더가 없어 값을 쓰지 않지만, 같은 모듈 모양을 지킨다.
 */
export interface ExportStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const exportStorage: ExportStorage = {
  getItem: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key, value) => {
    globalThis.localStorage?.setItem(key, value);
  },
};
