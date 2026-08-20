/**
 * 알림함·알림 설정·푸시 토큰 훅.
 *
 * 사용처: 알림 탭/페이지, 알림 설정 화면, 앱 시작 시 푸시 토큰 등록.
 */
import type { NotificationPrefsInput } from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type { NotificationList, NotificationPrefs } from "../types";
import { setAuthoritativeQueryData, useInvalidateKeys } from "./invalidate";

/** 30초마다 새로 받는다. 초과 알림은 늦게 알수록 쓸모가 줄어든다. */
const NOTIFICATION_POLL_MS = 30_000;
/** 부분 설정 PATCH가 서로의 전체 응답을 덮지 않도록 제출 순서를 보존한다. */
const NOTIFICATION_PREFS_MUTATION_SCOPE = {
  id: "notification-preferences",
} as const;

export function useNotifications() {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.notifications,
    refetchInterval: NOTIFICATION_POLL_MS,
    queryFn: async (context) =>
      unwrap<NotificationList>(
        await client.notifications.$get(
          undefined,
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      ),
  });
}

/** 알림함을 열면 전부 읽음 처리한다(탭 배지가 사라진다). */
export function useMarkNotificationsRead() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys([queryKeys.notifications]);
  return useMutation({
    mutationFn: async () => unwrap(await client.notifications.read.$post()),
    onSuccess: invalidate,
  });
}

/** 알림 한 건을 알림함에서 지운다. 안 읽은 알림이었다면 탭 배지도 함께 줄어든다. */
export function useDeleteNotification() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys([queryKeys.notifications]);
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await client.notifications[":id"].$delete({ param: { id } })),
    onSuccess: invalidate,
  });
}

export function useNotificationPrefs() {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.notificationPrefs,
    queryFn: async (context) =>
      unwrap<{ preferences: NotificationPrefs }>(
        await client.notifications.preferences.$get(
          undefined,
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      ),
  });
}

export function useUpdateNotificationPrefs() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: NOTIFICATION_PREFS_MUTATION_SCOPE,
    mutationFn: async (input: NotificationPrefsInput) =>
      unwrap<{ preferences: NotificationPrefs }>(
        await client.notifications.preferences.$patch({ json: input }),
      ),
    onSuccess: async (data) => {
      await setAuthoritativeQueryData(
        queryClient,
        queryKeys.notificationPrefs,
        data,
      );
    },
  });
}

/**
 * Expo 푸시 토큰을 서버에 등록한다(네이티브 전용).
 * 서버는 토큰을 사용자에 묶어 두고 초과 알림을 보낼 때 쓴다.
 */
export function useRegisterPushToken() {
  const { client, unwrap } = useLeaveApi();
  return useMutation({
    mutationFn: async (token: string) =>
      unwrap(await client.push.token.$put({ json: { token } })),
  });
}
