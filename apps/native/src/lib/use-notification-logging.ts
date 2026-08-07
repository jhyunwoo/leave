/**
 * 푸시 수신·열람 이벤트 보고 훅.
 * 사용처: apps/native/src/app/_layout.tsx (로그인 상태일 때만 켠다).
 */

import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { reportPushEvent } from "./notifications";

/** 푸시 data에 실린 알림 id(있으면)를 안전하게 추출한다. */
function extractNotificationId(data: unknown): string | undefined {
  if (data && typeof data === "object" && "notificationId" in data) {
    const value = (data as Record<string, unknown>).notificationId;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/**
 * 이 앱이 보낸 푸시 알림의 수신(receipt)·열람(open) 이벤트를 서버에 보고한다.
 * 동의 기반이며, 이 앱의 알림만 다룬다 (기기의 다른 앱 알림은 대상 아님).
 * @param enabled 로그인 상태일 때만 true — 인증된 요청으로만 보고한다.
 */
export function useNotificationLogging(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const receivedSub = Notifications.addNotificationReceivedListener((n) => {
      const content = n.request.content;
      void reportPushEvent({
        direction: "receipt",
        notificationId: extractNotificationId(content.data),
      });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (r) => {
        const content = r.notification.request.content;
        void reportPushEvent({
          direction: "open",
          notificationId: extractNotificationId(content.data),
        });
      },
    );

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [enabled]);
}
