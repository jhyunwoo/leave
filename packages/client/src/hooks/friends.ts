/**
 * 친구 훅 — 목록·요청 수명주기·친구 달력.
 *
 * 친구 일정은 이 앱이 다루는 서버 데이터 중 가장 민감한 축에 든다. 그래서
 * 캐시 정책이 다른 훅들과 다르다.
 *  - `staleTime: 0` — 화면에 들어올 때마다 권한을 서버에 다시 묻는다.
 *  - 디스크에 남기지 않는다 — 네이티브의 영속 캐시 허용 목록(`calendar`,
 *    `myLeaves`, `leaveBalances`, `leaveGrants`)에 `friends`가 없다.
 *  - 관계가 끊기면(삭제·차단) 그 사람의 캐시를 그 자리에서 지운다.
 *  - 서버가 403을 주면 남아 있던 본문도 지운다(`watchFriendAccessRevocation`).
 *
 * 마지막 항목이 필요한 이유: TanStack은 재조회가 실패해도 마지막 성공 데이터를
 * 그대로 들고 있는다. 그러면 친구가 나를 끊은 뒤에도 화면이 예전 일정을 계속
 * 그린다. 서버는 이미 막았지만, 앱이 굳이 붙들고 있을 이유가 없다.
 */
import {
  ApiError,
  normalizeFriendIds,
  type FriendRequestCreateInput,
} from "@leave/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
  type QueryClient,
} from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { createMonthRequestQueue } from "../month-request-queue";
import { queryKeys } from "../query-keys";
import type {
  Friend,
  FriendCalendar,
  FriendRequest,
  FriendSchedule,
} from "../types";

const enqueueFriendCalendar = createMonthRequestQueue<FriendCalendar>();

/**
 * 관계가 바뀌면 목록 셋과 사용자 검색·프로필이 함께 낡는다. 검색 결과에는
 * 관계 상태(`none`/`outgoing`/...)가 박혀 있어, 이걸 빼먹으면 요청을 보낸 뒤에도
 * 검색 화면이 계속 "친구 추가"를 보여준다.
 */
async function invalidateFriendLifecycle(queryClient: QueryClient) {
  await Promise.all(
    [
      queryKeys.friendList,
      queryKeys.incomingFriendRequests,
      queryKeys.outgoingFriendRequests,
      queryKeys.users,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export async function purgeFriendCalendarAccess(
  queryClient: QueryClient,
  userId: string,
) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: queryKeys.friendSchedules }),
    queryClient.cancelQueries({ queryKey: queryKeys.friendCalendars }),
  ]);
  queryClient.removeQueries({
    queryKey: queryKeys.friendSchedules,
    predicate: (query) => query.queryKey.includes(userId),
  });
  queryClient.removeQueries({
    queryKey: queryKeys.friendCalendars,
    predicate: (query) =>
      query.queryKey.some(
        (part) => Array.isArray(part) && part.includes(userId),
      ),
  });
}

/**
 * 서버가 친구 권한을 거절하면 캐시에 남은 본문을 지운다.
 *
 * 사용처: 앱 루트에서 QueryClient를 만든 직후 한 번(웹 main.tsx, 앱 _layout.tsx).
 * 훅이 아니라 구독인 이유는, 이 정리가 특정 화면이 떠 있는 동안만이 아니라
 * 캐시가 살아 있는 내내 유효해야 하기 때문이다.
 *
 * 이미 지워진 쿼리는 오류 상태가 아니므로 이 구독이 스스로를 다시 부르지 않는다.
 */
export function watchFriendAccessRevocation(
  queryClient: QueryClient,
): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    // TanStack은 캐시 이벤트의 query를 `Query<any, any, any, any>`로 준다.
    // 그대로 두면 아래에서 읽는 키·오류·데이터가 모두 any로 번지므로 여기서
    // 한 번만 좁혀 받는다. 런타임 계약은 동일하다 — 프레임워크 타이핑 한계다.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 위 주석
    const query: Query<unknown, Error> = event.query;
    const root: unknown = query.queryKey[0];
    if (root !== "friends") return;
    const error = query.state.error;
    if (!(error instanceof ApiError)) return;
    // 403은 "친구가 아니다", 404는 "그런 사람이 없다"(탈퇴·차단). 둘 다 지금
    // 들고 있는 본문을 더는 보여줄 근거가 없다는 뜻이다.
    if (error.status !== 403 && error.status !== 404) return;
    if (query.state.data === undefined) return;
    queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
  });
}

export function useFriends() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.friendList,
    queryFn: async () =>
      unwrap<{ friends: Friend[] }>(await client.friends.$get()),
  });
}

export function useIncomingFriendRequests() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: async () =>
      unwrap<{ requests: FriendRequest[] }>(
        await client.friends.requests.incoming.$get(),
      ),
  });
}

export function useOutgoingFriendRequests() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.outgoingFriendRequests,
    queryFn: async () =>
      unwrap<{ requests: FriendRequest[] }>(
        await client.friends.requests.outgoing.$get(),
      ),
  });
}

/**
 * 공개 사용자 이름으로 친구 요청.
 *
 * 상대가 이미 나에게 요청을 보내 뒀다면 서버가 409(`incoming_request_exists`)로
 * 답한다. 자동으로 친구가 되지 않으므로 화면은 그 코드를 보고 "받은 요청에서
 * 수락하라"고 안내한다. 그때도 받은 요청 목록이 새로 고쳐져야 하므로
 * 실패 경로에서도 수명주기 캐시를 무효화한다.
 */
export function useSendFriendRequest() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FriendRequestCreateInput) =>
      unwrap(await client.friends.requests.$post({ json: input })),
    onSettled: () => invalidateFriendLifecycle(queryClient),
  });
}

function useRequestAction(action: "accept" | "decline" | "cancel") {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (action === "accept") {
        return unwrap(
          await client.friends.requests[":userId"].accept.$post({
            param: { userId },
          }),
        );
      }
      if (action === "decline") {
        return unwrap(
          await client.friends.requests.incoming[":userId"].$delete({
            param: { userId },
          }),
        );
      }
      return unwrap(
        await client.friends.requests.outgoing[":userId"].$delete({
          param: { userId },
        }),
      );
    },
    onSuccess: () => invalidateFriendLifecycle(queryClient),
  });
}

export const useAcceptFriendRequest = () => useRequestAction("accept");
export const useDeclineFriendRequest = () => useRequestAction("decline");
export const useCancelFriendRequest = () => useRequestAction("cancel");

export function useRemoveFriend() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(await client.friends[":userId"].$delete({ param: { userId } })),
    onSuccess: async (_data, userId) => {
      // 목록을 다시 받기 전에 먼저 지운다 — 그 사이에 화면이 남은 일정을
      // 한 프레임이라도 더 그릴 이유가 없다.
      await purgeFriendCalendarAccess(queryClient, userId);
      await invalidateFriendLifecycle(queryClient);
    },
  });
}

export function useFriendSchedule(
  userId: string | null,
  startDate: string,
  endDate: string,
) {
  const adapter = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.friendSchedule(userId ?? "", startDate, endDate),
    enabled: userId !== null,
    // 화면에 들어올 때마다 권한을 서버에 다시 묻는다. 캐시된 친구 목록은 권한이 아니다.
    staleTime: 0,
    queryFn: (context) =>
      adapter.client.friends[":userId"].schedule
        .$get(
          { param: { userId: userId! }, query: { startDate, endDate } },
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) => adapter.unwrap<FriendSchedule>(response)),
  });
}

export function useFriendCalendar(friendIds: readonly string[], month: string) {
  const adapter = useLeaveApi();
  const normalized = normalizeFriendIds(friendIds);
  return useQuery({
    queryKey: queryKeys.friendCalendar(normalized, month),
    enabled: normalized.length >= 1 && normalized.length <= 10,
    staleTime: 0,
    queryFn: (context) =>
      enqueueFriendCalendar({
        adapter,
        scope: normalized.join(","),
        month,
        context,
        loadMonths: async (months, signal) => {
          const requestOptions = signal ? { init: { signal } } : undefined;
          if (months.length === 1) {
            const calendar = await adapter.unwrap<FriendCalendar>(
              await adapter.client.friends.calendar.$get(
                {
                  query: {
                    friendIds: normalized.join(","),
                    month: months[0]!,
                  },
                },
                requestOptions,
              ),
            );
            return new Map([[calendar.month, calendar]]);
          }
          const result = await adapter.unwrap<{
            calendars: FriendCalendar[];
          }>(
            await adapter.client.friends.calendars.$get(
              {
                query: {
                  friendIds: normalized.join(","),
                  months: months.join(","),
                },
              },
              requestOptions,
            ),
          );
          return new Map(
            result.calendars.map((calendar) => [calendar.month, calendar]),
          );
        },
      }),
  });
}
