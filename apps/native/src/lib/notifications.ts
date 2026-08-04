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
 * 푸시 권한 요청 + Expo 푸시 토큰 발급.
 * 시뮬레이터/권한 거부/Expo Go 제약 등 실패 상황에서는 null을 반환하고 앱 흐름을 막지 않는다.
 */
export async function getPushToken(): Promise<string | null> {
  try {
    if (process.env.EXPO_OS === "web" || !Device.isDevice) return null;

    if (process.env.EXPO_OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "기본 알림",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#9fe870",
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return null;

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
