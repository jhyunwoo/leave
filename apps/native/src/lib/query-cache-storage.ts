interface QueryCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// 웹은 메모리 Query cache만 사용한다. Metro는 네이티브 빌드에서 같은 이름의
// query-cache-storage.native.ts를 골라 SQLite 구현으로 교체한다.
export const queryCacheStorage: QueryCacheStorage | null = null;
