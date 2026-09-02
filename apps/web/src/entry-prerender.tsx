/**
 * 빌드 시 공개 페이지를 HTML로 미리 그리는 진입점.
 *
 * `vite build --ssr`가 이 파일을 Node용으로 묶고, `scripts/build-seo.mjs`가
 * 그 결과를 불러 `dist/*.html`을 쓴다. 브라우저 번들에는 들어가지 않는다.
 *
 * 브라우저와 **같은 컴포넌트 트리**를 그린다. 그래야 `main.tsx`의
 * `hydrateRoot`가 미리 그린 DOM을 그대로 이어받는다. 다른 점은 라우터뿐이다 —
 * BrowserRouter는 Node에 없는 `window.history`를 읽으므로 MemoryRouter를 쓴다.
 * 두 라우터 모두 DOM 요소를 만들지 않아 마크업은 같다.
 *
 * 미리 그리는 화면은 언제나 "로그인하지 않은 방문자가 보는 것"이다
 * (`dom-stub`이 빈 저장소를 준다). 크롤러가 보는 것과 정확히 같다.
 */

import "./prerender/dom-stub";

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ApiProvider } from "./api/provider";
import { AppRoutes } from "./App";
import { NotFoundPage } from "./pages/NotFoundPage";
import { createWebQueryClient } from "./query-client";

export {
  headTagsForNonIndexable,
  headTagsForPage,
  SESSION_FLAG_SCRIPT,
} from "./seo/head";
export {
  APP_SHELL_FILE,
  NOT_FOUND_FILE,
  PRERENDERED_PAGES,
  TITLE_SUFFIX,
} from "./seo/routes";
export { buildRobotsTxt, buildSitemapXml } from "./seo/robots";
export { SITE_NAME } from "./seo/site";

/** 한 경로의 `#root` 안쪽 마크업. */
export function renderRoute(path: string): string {
  return renderToString(
    <StrictMode>
      <QueryClientProvider client={createWebQueryClient()}>
        <ApiProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </ApiProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

/** 404 문서의 본문. 자바스크립트 없이 그대로 보이는 화면이라 라우터가 없다. */
export function renderNotFound(): string {
  return renderToString(<NotFoundPage />);
}
