/**
 * 웹 앱 진입점 — 프로바이더 3층을 쌓는다.
 *
 * QueryClientProvider(서버 상태) → ApiProvider(요청 수단·세션) → App(라우팅).
 * 순서가 중요하다: ApiProvider는 401을 만나면 쿼리 캐시를 비워야 하므로
 * QueryClientProvider 안쪽이어야 한다.
 */

import { watchFriendAccessRevocation } from "@leave/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiProvider } from "./api/provider";
import { App } from "./App";
import { createWebQueryClient } from "./query-client";
import "./styles/global.css";

const queryClient = createWebQueryClient();

// 서버가 친구 권한을 거절하면(403/404) 캐시에 남은 일정 본문도 함께 버린다.
// 서버는 이미 막았지만, 재조회가 실패해도 TanStack은 마지막 성공 데이터를
// 들고 있으므로 앱이 그것을 계속 그릴 수 있다.
watchFriendAccessRevocation(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* ApiProvider는 401 처리에서 쿼리 캐시를 비우므로 QueryClientProvider 안쪽이어야 한다. */}
      <ApiProvider>
        <App />
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
