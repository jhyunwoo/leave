/**
 * 복무 기념일 알림을 눌렀을 때 어디로 가는가.
 *
 * 사용처: 알림함(`screens/notifications.tsx`)과 루트 레이아웃의 푸시 탭 처리.
 *
 * 내 기념일은 축하 화면(`/celebrate`)으로, 친구의 기념일은 그 친구의 프로필로 간다.
 * 프로필 주소는 @아이디라 친구 목록에서 이름을 찾는다. 목록에 없으면(그 사이 친구를
 * 끊었거나 아직 목록을 받지 못했으면) 친구 탭까지만 간다.
 *
 * 서버는 기념일 푸시의 data에 기념일을 함께 싣는다(`lib/social-notify.ts`의
 * `deliverEach`). 그래서 푸시를 누르면 알림함을 거치지 않고 곧장 축하 화면이 열린다.
 */

import { queryKeys, type Friend, type NotificationList } from "@leave/client";
import {
  milestoneParams,
  parseMilestoneParams,
} from "@leave/shared/milestones";
import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

export type MilestoneLink = NonNullable<
  NotificationList["notifications"][number]["milestone"]
>;

/** 푸시 data에서 기념일을 꺼낸다. 모양이 맞지 않으면 null. */
export function parsePushMilestone(data: unknown): MilestoneLink | null {
  if (!data || typeof data !== "object" || !("milestone" in data)) return null;
  const raw = (data as { milestone: unknown }).milestone;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const milestone = parseMilestoneParams({
    kind: typeof value.kind === "string" ? value.kind : null,
    days: typeof value.days === "number" ? String(value.days) : null,
    rank: typeof value.rank === "string" ? value.rank : null,
  });
  if (!milestone) return null;
  const userId = typeof value.userId === "string" ? value.userId : null;
  return { ...milestone, userId };
}

/**
 * 기념일 하나를 연다.
 *
 * 친구 기념일의 @아이디는 **이미 캐시에 있는** 친구 목록에서 찾는다. 이 훅은 루트
 * 레이아웃에서도 돌기 때문에 `useFriends()`를 부르면 앱을 켤 때마다 친구 목록을
 * 받고 1분마다 다시 받게 된다. 친구 탭을 한 번이라도 연 사람이면 목록이 디스크
 * 캐시에 남아 있다.
 */
export function useOpenMilestone() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return (link: MilestoneLink) => {
    const { userId, ...milestone } = link;
    if (!userId) {
      router.push({
        pathname: "/celebrate",
        params: milestoneParams(milestone),
      });
      return;
    }
    const username = queryClient
      .getQueryData<{ friends: Friend[] }>(queryKeys.friendList)
      ?.friends.find((friend) => friend.userId === userId)?.username;
    if (username) {
      router.push({ pathname: "/u/[username]", params: { username } });
    } else {
      router.navigate("/(tabs)/(friends)");
    }
  };
}

/**
 * 기념일 푸시를 누르면 그 화면을 연다. 앱이 꺼져 있다가 푸시로 켜진 경우도 다룬다.
 *
 * `canNavigate`가 참이 된 뒤에만 연다 — 로그인·온보딩을 지나기 전에는 갈 곳이
 * 없다. 같은 푸시를 두 번 열지 않도록 처리한 알림 id를 기억하고, 마지막 응답도
 * 비운다(다음 콜드 스타트에서 다시 열리지 않게).
 *
 * 웹에서는 푸시 응답 API가 없다(`getLastNotificationResponse`가 던진다).
 */
export function useMilestonePushNavigation(canNavigate: boolean): void {
  const open = useOpenMilestone();
  // 리스너는 한 번만 붙이고, 누를 때마다 최신 라우터·캐시로 연다.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!canNavigate || process.env.EXPO_OS === "web") return;

    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        return;
      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;
      const link = parsePushMilestone(
        response.notification.request.content.data,
      );
      if (!link) return;
      handled.current.add(id);
      Notifications.clearLastNotificationResponse();
      openRef.current(link);
    };

    handle(Notifications.getLastNotificationResponse());
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [canNavigate]);
}
