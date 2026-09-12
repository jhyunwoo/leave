/**
 * 웹 앱 진입점 — 프로바이더 3층을 쌓는다.
 *
 * QueryClientProvider(서버 상태) → ApiProvider(요청 수단·세션) → App(라우팅).
 * 순서가 중요하다: ApiProvider는 401을 만나면 쿼리 캐시를 비워야 하므로
 * QueryClientProvider 안쪽이어야 한다.
 *
 * ## 미리 그린 HTML이 있으면 hydrate, 아니면 새로 그린다
 *
 * 공개 페이지(`/`, `/guide`)는 빌드 시 HTML로 구워져 나간다
 * (`entry-prerender.tsx` → `scripts/build-seo.mjs`). 그 문서의 `#root`에는
 * `data-prerendered="<경로>"`가 붙어 있다. 지금 주소가 그 경로와 같고 브라우저가
 * 그릴 결과가 미리 그린 것과 같을 때만 `hydrateRoot`로 DOM을 이어받는다 —
 * 그러면 이미 보이는 화면이 다시 그려지지 않는다.
 *
 * `/`는 로그인 여부에 따라 그리는 것이 달라지므로(랜딩 vs 달력), 세션이 있으면
 * 이어받지 않고 비우고 새로 그린다. 그 잠깐의 랜딩 노출은 문서 head의 인라인
 * 스크립트가 남기는 `<html data-session>`과 global.css 규칙이 첫 페인트 전에
 * 막는다.
 *
 * ## 프로필 링크로 들어왔으면 앱에 먼저 기회를 준다
 *
 * 맨 아래에서 한 번, 앱으로 넘겨 본다. 이 자리인 이유는 `app-handoff.ts`에 있다 —
 * 요약하면 **문서 진입에서만** 해야 하기 때문이다. `/u/:username`은 웹 안에서도
 * 링크로 오가는 주소라(친구 목록, "내 공개 프로필 보기"), 라우트 쪽에 두면 웹에서
 * 친구를 누를 때마다 앱으로 튕긴다. 로그인 여부와는 무관해서 인증 분기보다 위에
 * 둘 수 있다. 미리 그리는 진입점(entry-prerender.tsx)에는 `window`가 없으므로
 * 이 판단이 그쪽으로 새지 않는다.
 */

import { watchFriendAccessRevocation } from "@leave/client";
import { profileAppLink, profileUsernameFromUrl } from "@leave/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { getAuthToken } from "./api/client";
import { ApiProvider } from "./api/provider";
import { App } from "./App";
import { openAppIfMobile } from "./lib/app-handoff";
import { createWebQueryClient } from "./query-client";
import { normalizePath } from "./seo/routes";
import "./styles/global.css";

const queryClient = createWebQueryClient();

// 서버가 친구 권한을 거절하면(403/404) 캐시에 남은 일정 본문도 함께 버린다.
// 서버는 이미 막았지만, 재조회가 실패해도 TanStack은 마지막 성공 데이터를
// 들고 있으므로 앱이 그것을 계속 그릴 수 있다.
watchFriendAccessRevocation(queryClient);

const container = document.getElementById("root")!;

// 미리 그린 조각을 감추던 CSS 훅을 뗀다. 여기서부터는 React가 이 노드를 갖는다.
const prerenderedPath = container.getAttribute("data-prerendered");
container.removeAttribute("data-prerendered");

const tree = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* ApiProvider는 401 처리에서 쿼리 캐시를 비우므로 QueryClientProvider 안쪽이어야 한다. */}
      <ApiProvider>
        <App />
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>
);

const currentPath = normalizePath(window.location.pathname);
const canHydrate =
  prerenderedPath === currentPath &&
  // `/`만 세션에 따라 다른 화면을 그린다. 나머지 공개 페이지는 누구에게나 같다.
  (currentPath !== "/" || getAuthToken() === null);

if (canHydrate) {
  hydrateRoot(container, tree);
} else {
  container.replaceChildren();
  createRoot(container).render(tree);
}

// 공유된 프로필 주소로 직접 들어온 경우에만 앱을 찔러 본다. 렌더를 예약한 뒤라
// 앱이 없으면 이 화면이 그대로 그려진다.
const sharedProfile = profileUsernameFromUrl(currentPath);
if (sharedProfile) {
  openAppIfMobile(profileAppLink(sharedProfile));
}
