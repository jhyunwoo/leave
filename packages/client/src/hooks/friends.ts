import {
  normalizeFriendIds,
  type FriendRequestCreateInput,
} from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type {
  Friend,
  FriendCalendar,
  FriendRequest,
  FriendSchedule,
} from "../types";

async function invalidateFriendLifecycle(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.friendList }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.incomingFriendRequests,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.outgoingFriendRequests,
    }),
  ]);
}

export async function purgeFriendCalendarAccess(
  queryClient: ReturnType<typeof useQueryClient>,
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

export function useSendFriendRequest() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FriendRequestCreateInput) =>
      unwrap(await client.friends.requests.$post({ json: input })),
    onSuccess: () => invalidateFriendLifecycle(queryClient),
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
    queryFn: (context) =>
      adapter.client.friends.calendar
        .$get(
          { query: { friendIds: normalized.join(","), month } },
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) => adapter.unwrap<FriendCalendar>(response)),
  });
}
