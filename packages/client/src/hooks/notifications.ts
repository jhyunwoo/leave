/**
 * 알림함·알림 설정·푸시 토큰 훅.
 *
 * 사용처: 알림 탭/페이지, 알림 설정 화면, 앱 시작 시 푸시 토큰 등록.
 */
import type { NotificationPrefsInput } from "@leave/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type { NotificationList, NotificationPrefs } from "../types";
import { useInvalidateKeys } from "./invalidate";

/** 30초마다 새로 받는다. 초과 알림은 늦게 알수록 쓸모가 줄어든다. */
const NOTIFICATION_POLL_MS = 30_000;

export function useNotifications() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.notifications,
    refetchInterval: NOTIFICATION_POLL_MS,
    queryFn: async () =>
      unwrap<NotificationList>(await client.notifications.$get()),
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

export function useNotificationPrefs() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.notificationPrefs,
    queryFn: async () =>
      unwrap<{ preferences: NotificationPrefs }>(
        await client.notifications.preferences.$get(),
      ),
  });
}

export function useUpdateNotificationPrefs() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys([queryKeys.notificationPrefs]);
  return useMutation({
    mutationFn: async (input: NotificationPrefsInput) =>
      unwrap<{ preferences: NotificationPrefs }>(
        await client.notifications.preferences.$patch({ json: input }),
      ),
    onSuccess: invalidate,
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
