/**
 * 쿼리 캐시 저장소 — iOS/Android용 SQLite 구현.
 * 파일 이름의 `.native`가 Metro의 플랫폼 확장자 규칙에 따라 자동 선택된다.
 */

import { SQLiteStorage } from "expo-sqlite/kv-store";

interface QueryCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const queryCacheStorage: QueryCacheStorage | null = new SQLiteStorage(
  "leave-query-cache.db",
);
