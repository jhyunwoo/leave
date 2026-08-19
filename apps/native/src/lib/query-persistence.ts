/**
 * 오프라인 대비 쿼리 캐시 디스크 저장 설정.
 *
 * 사용처: apps/native/src/app/_layout.tsx.
 *
 * 무엇을 남길지가 이 파일의 핵심이다. 계정·알림 같은 민감하거나 금방 낡는
 * 데이터는 기기에 남기지 않고, 오프라인에서 실제로 다시 보여줄 읽기 데이터
 * (달력·내 휴가·잔여·적립분)만 명시적으로 허용한다.
 */

import { todayInSeoul } from "@leave/shared/dates";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import type {
  PersistedClient,
  Persister,
  PersistQueryClientProviderProps,
} from "@tanstack/react-query-persist-client";
import { AppState, type AppStateStatus } from "react-native";
import { queryCacheStorage } from "./query-cache-storage";

export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1_000;

// v2: 달력 응답에 출타 명단(attendees)이 추가됐다. 옛 캐시는 명단이 비어 보인다.
// v3: 잔여 응답에 upcomingAsOfTodayDays가 추가됐다. 내 휴가 탭의 보유 휴가 카드가
//     이 값을 더하므로, 필드가 없는 옛 캐시가 되살아나면 "남은 NaN일"이 보인다.
// v4: 달력을 "가까운 달"만 저장하도록 좁혔다(아래 CALENDAR_PERSIST_SPAN). 옛
//     캐시에는 먼 달이 잔뜩 들어 있어 그대로 되살리면 이번 변경의 목적이 사라진다.
const CACHE_BUSTER = "native-offline-read-v4";
const CACHE_KEY = "tanstack-query-cache";

// 계정·알림·관리자 데이터와 mutation은 기기에 남기지 않는다. 오프라인에서
// 실제로 다시 보여줄 읽기 데이터만 명시적으로 허용한다.
const PERSISTED_QUERY_ROOTS = new Set([
  "calendar",
  "myLeaves",
  "leaveBalances",
  "leaveGrants",
]);

/**
 * 디스크에 남기는 달력의 범위(오늘 기준 앞뒤 개월 수).
 *
 * 달력은 달마다 별도의 쿼리(`["calendar", unitId, "YYYY-MM"]`)다. 무한 스크롤로
 * 훑은 달이 전부 저장 대상이 되면 저장분이 사용량에 비례해 자란다. 측정값
 * (한 달 ≈ 29KB, 40명 부대·월 90건 기준):
 *
 *     3개월  →  87KB   parse 0.5ms
 *    12개월  → 349KB   parse 5.0ms
 *    30개월  → 872KB   parse 18.4ms
 *    60개월  →  1.7MB  parse 24.4ms      (Node/V8 aarch64 기준)
 *
 * 이 parse는 앱을 켤 때마다 **한 번에** 일어나고, 그동안 달력 화면은
 * `useIsRestoring()` 때문에 스피너에 머문다. 저사양 안드로이드의 Hermes는 이보다
 * 몇 배 느리다. 게다가 저장은 캐시가 바뀔 때마다 전체를 다시 문자열로 만드는
 * 방식이라, 달을 새로 받을 때마다 그 크기만큼의 stringify가 스크롤 도중에 돈다.
 *
 * 그래서 "오프라인에서 실제로 볼 달"만 남긴다. 통신이 끊긴 훈련장에서 필요한 건
 * 이번 달과 그 언저리이지 재작년 3월이 아니다. 먼 달은 온라인에서 다시 받는다.
 */
const CALENDAR_PERSIST_SPAN = 3;

/** `["calendar", unitId, "YYYY-MM"]`의 달이 저장 범위 안인가. */
function isCalendarMonthWorthPersisting(month: unknown): boolean {
  if (typeof month !== "string") return false;
  const today = todayInSeoul();
  const anchor = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1;
  const target = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  if (!Number.isFinite(target)) return false;
  return Math.abs(target - anchor) <= CALENDAR_PERSIST_SPAN;
}

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
      if (query.state.status !== "success") return false;
      if (typeof root !== "string" || !PERSISTED_QUERY_ROOTS.has(root))
        return false;
      // 달력만 범위를 더 좁힌다. 나머지(내 휴가·잔여·적립분)는 한 건씩이라
      // 크기가 사용량에 비례해 자라지 않는다.
      if (root === "calendar")
        return isCalendarMonthWorthPersisting(query.queryKey[2]);
      return true;
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

  /**
   * 포커스 판단을 AppState와 연결한다.
   *
   * React Query의 기본 focusManager는 `window`의 visibilitychange를 본다. React
   * Native에는 그런 게 없어서, 연결하지 않으면 앱은 **영원히 포커스 상태**로
   * 취급된다. 그 결과:
   *
   *  - 알림함의 `refetchInterval: 30_000`이 탭 레이아웃에 걸려 있어(배지 때문에)
   *    앱이 백그라운드로 내려가도 30초마다 계속 요청이 나간다. 데이터가 아깝고
   *    배터리가 아깝고, 신호가 오락가락하는 곳에서는 재시도까지 겹친다.
   *  - `refetchOnWindowFocus`가 아무 때도 걸리지 않아, 앱으로 돌아와도 화면이
   *    낡은 채로 남는다.
   *
   * 연결하면 둘 다 제자리를 찾는다 — 백그라운드에서는 폴링이 멈추고, 돌아오는
   * 순간 낡은 쿼리만 한 번 새로 받는다.
   */
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener(
      "change",
      (status: AppStateStatus) => handleFocus(status === "active"),
    );
    return () => subscription.remove();
  });
}
