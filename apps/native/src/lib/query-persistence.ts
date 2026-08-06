import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import type {
  PersistedClient,
  Persister,
  PersistQueryClientProviderProps,
} from "@tanstack/react-query-persist-client";
import { queryCacheStorage } from "./query-cache-storage";

export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1_000;

// v2: 달력 응답에 출타 명단(attendees)이 추가됐다. 옛 캐시는 명단이 비어 보인다.
const CACHE_BUSTER = "native-offline-read-v2";
const CACHE_KEY = "tanstack-query-cache";

// 계정·알림·관리자 데이터와 mutation은 기기에 남기지 않는다. 오프라인에서
// 실제로 다시 보여줄 읽기 데이터만 명시적으로 허용한다.
const PERSISTED_QUERY_ROOTS = new Set([
  "calendar",
  "myLeaves",
  "leaveBalances",
  "leaveGrants",
]);

// Query cache 변경은 짧은 시간에 연달아 발생한다. SQLite 쓰기와 삭제 순서를
// 직렬화해 로그아웃 직전의 늦은 쓰기가 삭제된 캐시를 되살리지 않게 한다.
let storageQueue: Promise<void> = Promise.resolve();

function enqueueStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(operation, operation);
  storageQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export const queryPersister = {
  persistClient: (client: PersistedClient) =>
    enqueueStorageOperation(async () => {
      await queryCacheStorage?.setItem(CACHE_KEY, JSON.stringify(client));
    }),
  restoreClient: () =>
    enqueueStorageOperation(async () => {
      if (!queryCacheStorage) return undefined;

      const serialized = await queryCacheStorage.getItem(CACHE_KEY);
      if (!serialized) return undefined;

      try {
        return JSON.parse(serialized) as PersistedClient;
      } catch {
        await queryCacheStorage.removeItem(CACHE_KEY);
        return undefined;
      }
    }),
  removeClient: () =>
    enqueueStorageOperation(async () => {
      await queryCacheStorage?.removeItem(CACHE_KEY);
    }),
} satisfies Persister;

export const queryPersistenceOptions = {
  persister: queryPersister,
  buster: CACHE_BUSTER,
  maxAge: QUERY_CACHE_MAX_AGE,
  dehydrateOptions: {
    shouldDehydrateMutation: () => false,
    shouldDehydrateQuery: (query) => {
      const root = query.queryKey[0];
      return (
        query.state.status === "success" &&
        typeof root === "string" &&
        PERSISTED_QUERY_ROOTS.has(root)
      );
    },
  },
} satisfies PersistQueryClientProviderProps["persistOptions"];

/** 로그아웃·계정 삭제·인증 만료 뒤 계정별 오프라인 데이터를 함께 지운다. */
export async function clearPersistedQueryCache(): Promise<void> {
  await queryPersister.removeClient();
}

let onlineManagerConfigured = false;

/** TanStack Query의 재시도/재연결 판단을 React Native 네트워크 상태와 연결한다. */
export function configureQueryOnlineManager(): void {
  if (onlineManagerConfigured) return;
  onlineManagerConfigured = true;

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      if (state.isConnected === null) return;
      setOnline(state.isConnected && state.isInternetReachable !== false);
    }),
  );
}
