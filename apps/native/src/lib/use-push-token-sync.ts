/**
 * 앱을 열 때마다 이 기기의 푸시 토큰을 서버에 다시 등록하는 훅.
 * 사용처: apps/native/src/app/_layout.tsx (온보딩까지 마친 로그인 상태에서만 켠다).
 *
 * Expo 토큰 문자열은 그대로여도, Expo 서버가 그 토큰에 묶어 둔 APNs 기기 토큰은
 * 재설치·기기 복원 뒤에 낡을 수 있다. 그러면 발송과 receipt는 둘 다 ok인데 기기에는
 * 아무것도 오지 않는다(2026-10-11 실제로 겪음). `getExpoPushTokenAsync`를 다시
 * 부르면 Expo가 새 기기 토큰으로 갱신하므로, 설정 화면 버튼을 누를 때만이 아니라
 * 매 실행마다 부른다. 권한 창은 띄우지 않는다 — 알림을 켤지는 사용자가 정한다.
 */

import { useEffect } from "react";
import { api } from "../api/client";
import { getPushToken } from "./notifications";

export function usePushTokenSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      const token = await getPushToken({ askPermission: false });
      if (!token) return;
      try {
        await api.push.token.$put({ json: { token } });
      } catch {
        // 다음 실행에서 다시 시도한다.
      }
    })();
  }, [enabled]);
}
