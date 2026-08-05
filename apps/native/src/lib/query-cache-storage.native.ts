import { SQLiteStorage } from "expo-sqlite/kv-store";

interface QueryCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const queryCacheStorage: QueryCacheStorage | null = new SQLiteStorage(
  "leave-query-cache.db",
);
