/**
 * 웹 앱과 공용 데이터 계층(`@leave/client`)을 잇는 어댑터.
 *
 * 사용처: apps/web/src/main.tsx — QueryClientProvider 안쪽에 한 번만 둔다.
 * (안쪽이어야 401 처리에서 React Query 캐시를 비울 수 있다.)
 */
import { LeaveApiProvider, type LeaveApiAdapter } from "@leave/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useEffect, useMemo, type ReactNode } from "react";
import { tokenAtom } from "../state/auth";
import { api, setUnauthorizedHandler, unwrap } from "./client";

export function ApiProvider(props: { children: ReactNode }) {
  const setToken = useSetAtom(tokenAtom);
  const queryClient = useQueryClient();

  // 저장된 토큰이 서버에서 더는 통하지 않으면(만료·세션 삭제) 조용히 로그아웃한다.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear();
      setToken(null);
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, setToken]);

  const adapter = useMemo<LeaveApiAdapter>(
    () => ({
      client: api,
      unwrap,
      // 웹은 localStorage 한 곳만 쓰므로 tokenAtom 쓰기가 곧 영속화다.
      setSessionToken: (token) => setToken(token),
    }),
    [setToken],
  );

  return (
    <LeaveApiProvider adapter={adapter}>{props.children}</LeaveApiProvider>
  );
}
