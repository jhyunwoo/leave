/**
 * 위젯 설정 저장소 — iOS/Android 구현.
 *
 * 쿼리 캐시(`lib/query-cache-storage.native.ts`)와 같은 방식이되 데이터베이스를
 * 나눈다. 쿼리 캐시는 로그아웃할 때 통째로 지우는 대상이고(clearPersistedQueryCache),
 * 위젯 설정은 계정과 무관한 이 기기의 취향이라 그때 함께 지워지면 안 된다.
 */

import { SQLiteStorage } from "expo-sqlite/kv-store";

export interface WidgetStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const widgetStorage: WidgetStorage = new SQLiteStorage(
  "leave-widget-preferences.db",
);
