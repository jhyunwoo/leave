/**
 * 네이티브 앱과 공용 데이터 계층(`@leave/client`)을 잇는 어댑터.
 *
 * 사용처: apps/native/src/app/_layout.tsx — PersistQueryClientProvider 안쪽.
 *
 * 웹과 다른 점은 두 가지다.
 *  - 토큰을 SecureStore에 넣는다(웹은 localStorage).
 *  - 오프라인용 디스크 쿼리 캐시가 있어, 세션이 바뀌면 그것도 지워야 한다.
 *    안 지우면 앱을 다시 켰을 때 이전 사용자의 화면이 잠깐 되살아난다.
 */
import { LeaveApiProvider, type LeaveApiAdapter } from "@leave/client/context";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useEffect, useMemo, type ReactNode } from "react";
import { clearPendingProfile } from "@/lib/pending-profile-link";
import { clearPersistedQueryCache } from "@/lib/query-persistence";
import { setSessionAtom } from "@/state/auth";
import { api, setUnauthorizedHandler, unwrap } from "./client";

export function ApiProvider(props: { children: ReactNode }) {
  const setSession = useSetAtom(setSessionAtom);
  const queryClient = useQueryClient();

  // 저장된 토큰이 서버에서 더는 통하지 않으면(만료·세션 삭제) 조용히 로그아웃한다.
  // 토큰을 비우면 루트 레이아웃의 Stack.Protected가 로그인 화면으로 돌려보낸다.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear();
      void clearPersistedQueryCache();
      // 이전 사용자가 눌렀던 프로필 링크를 다음 사용자에게 물려주지 않는다.
      clearPendingProfile();
      void setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, setSession]);

  const adapter = useMemo<LeaveApiAdapter>(
    () => ({
      client: api,
      unwrap,
      setSessionToken: async (token) => {
        await clearPersistedQueryCache();
        if (token === null) clearPendingProfile();
        await setSession(token);
      },
    }),
    [setSession],
  );

  return (
    <LeaveApiProvider adapter={adapter}>{props.children}</LeaveApiProvider>
  );
}
