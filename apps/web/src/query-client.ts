import { queryKeys, shouldRetryQuery } from "@leave/client";
import { QueryClient } from "@tanstack/react-query";

/**
 * Freshness reflects how each server-state family changes; it is deliberately
 * not one global duration.
 *
 * `Infinity` is safe for onboarding because every local onboarding mutation
 * explicitly invalidates the key. Unlike TanStack's `"static"` mode, explicit
 * invalidation still marks it stale and refetches it.
 */
export const WEB_QUERY_STALE_TIMES = {
  session: Infinity,
  profileConfig: 5 * 60_000,
  collaborative: 30_000,
  notifications: 30_000,
  mutationSensitive: 2 * 60_000,
} as const;

export function createWebQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
      },
    },
  });

  queryClient.setQueryDefaults(queryKeys.onboarding, {
    staleTime: WEB_QUERY_STALE_TIMES.session,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  for (const queryKey of [
    queryKeys.me,
    queryKeys.notificationPrefs,
    queryKeys.friendSharing,
  ]) {
    queryClient.setQueryDefaults(queryKey, {
      staleTime: WEB_QUERY_STALE_TIMES.profileConfig,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    });
  }

  for (const queryKey of [
    queryKeys.calendars,
    queryKeys.allUnitMembers,
    queryKeys.allBlackouts,
  ]) {
    queryClient.setQueryDefaults(queryKey, {
      staleTime: WEB_QUERY_STALE_TIMES.collaborative,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    });
  }

  queryClient.setQueryDefaults(queryKeys.notifications, {
    staleTime: WEB_QUERY_STALE_TIMES.notifications,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  for (const queryKey of [
    queryKeys.myLeaves,
    queryKeys.leaveBalances,
    queryKeys.leaveGrants,
  ]) {
    queryClient.setQueryDefaults(queryKey, {
      staleTime: WEB_QUERY_STALE_TIMES.mutationSensitive,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    });
  }

  return queryClient;
}
