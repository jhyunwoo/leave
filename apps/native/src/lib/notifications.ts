/**
 * Expo 푸시 권한·토큰 발급과 수신/열람 이벤트 보고.
 *
 * 사용처: 알림 설정 화면(토큰 등록), 루트 레이아웃(이벤트 보고 훅).
 * 시뮬레이터·권한 거부처럼 토큰을 못 받는 상황에서는 null을 돌려주고 앱 흐름을
 * 막지 않는다. 푸시는 편의 기능이지 진입 조건이 아니다.
 */

import type { PushEventInput } from "@leave/shared";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "../api/client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * 푸시 권한이 있는지 보고, `ask`면 없을 때 묻는다. 웹·시뮬레이터는 false.
 * 안드로이드 13+는 채널이 있어야 권한 창이 뜨므로 채널부터 만든다.
 */
async function ensurePushPermission(ask: boolean): Promise<boolean> {
  if (process.env.EXPO_OS === "web" || !Device.isDevice) return false;

  if (process.env.EXPO_OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "기본 알림",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#9fe870",
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  if (!ask) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * 권한만 묻는다(온보딩용). 토큰 등록은 서버가 온보딩 완료 전에는 428로 거절하므로
 * 온보딩이 끝난 뒤 `usePushTokenSync`가 한다.
 */
export async function requestPushPermission(): Promise<boolean> {
  try {
    return await ensurePushPermission(true);
  } catch {
    return false;
  }
}

/**
 * Expo 푸시 토큰 발급. `askPermission`이 false면 권한 창을 띄우지 않고, 권한이 없으면 null.
 * 시뮬레이터/권한 거부/Expo Go 제약 등 실패 상황에서는 null을 반환하고 앱 흐름을 막지 않는다.
 */
export async function getPushToken({
  askPermission = true,
}: { askPermission?: boolean } = {}): Promise<string | null> {
  try {
    if (!(await ensurePushPermission(askPermission))) return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data;
  } catch {
    return null;
  }
}

/**
 * 이 앱이 보낸 푸시의 수신/열람 이벤트를 서버에 보고한다 (동의 기반).
 * 보고 실패는 앱 흐름을 막지 않는다.
 */
export async function reportPushEvent(input: PushEventInput): Promise<void> {
  try {
    await api.push.events.$post({ json: input });
  } catch {
    // 로깅 실패는 무시
  }
}
