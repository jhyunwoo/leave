/**
 * 웹 앱 진입점 — 프로바이더 3층을 쌓는다.
 *
 * QueryClientProvider(서버 상태) → ApiProvider(요청 수단·세션) → App(라우팅).
 * 순서가 중요하다: ApiProvider는 401을 만나면 쿼리 캐시를 비워야 하므로
 * QueryClientProvider 안쪽이어야 한다.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiProvider } from "./api/provider";
import { App } from "./App";
import { createWebQueryClient } from "./query-client";
import "./styles/global.css";

const queryClient = createWebQueryClient();

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
