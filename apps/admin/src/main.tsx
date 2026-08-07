/**
 * 관리자 SPA 진입점.
 *
 * 401·403은 재시도하지 않는다 — 권한이 없어서 막힌 요청은 다시 보내도 결과가
 * 같고, 화면 전환마다 실패 요청이 세 번씩 쌓이면 감사 로그만 지저분해진다.
 * 창 포커스 재조회도 끈다(관리자 화면은 명시적으로 새로고침하는 편이 예측 가능하다).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-sans-kr";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (failureCount, error) => {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          (error.status === 401 || error.status === 403)
        ) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("root element not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
