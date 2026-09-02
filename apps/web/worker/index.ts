/**
 * 정적 자산에 얹은 얇은 라우팅 층.
 *
 * 이 워커는 **정적 자산으로 답할 수 없는 요청에만** 불린다. Cloudflare의 기본
 * 동작이 그렇다 — 파일이 있으면 워커를 거치지 않고 그대로 나간다. 그래서
 * `/`(미리 그린 랜딩), `/guide`, `/privacy`, `/assets/*`는 여기까지 오지 않고,
 * 오는 것은 SPA 경로와 존재하지 않는 주소뿐이다.
 *
 * 이 층이 있는 이유는 하나다: `not_found_handling: "single-page-application"`은
 * **모든** 모르는 주소에 index.html을 200으로 돌려준다. 그러면
 *  - 오타 주소·수집된 쓰레기 주소가 전부 "정상 페이지"로 색인 후보가 되고
 *    (soft 404 → 색인 낭비, 홈과 중복),
 *  - 로그인·앱 화면에 경로별 X-Robots-Tag를 붙일 자리가 없다.
 *
 * 표(`src/seo/routes.ts`)에 있는 주소만 셸을 200으로 받고, 나머지는 404 문서를
 * **404 상태로** 받는다.
 *
 * ## 응답은 반드시 ASSETS를 거쳐 만든다
 *
 * `public/_headers`의 보안 헤더(CSP·HSTS·프레임 차단 등)는 정적 자산 응답에만
 * 붙는다. 워커가 직접 만든 Response에는 붙지 않는다(확인 후 확정한 동작이다).
 * 그러니 여기서는 언제나 `env.ASSETS.fetch()`가 준 응답을 바탕으로 답한다 —
 * 그래야 보안 헤더의 출처가 `_headers` 한 곳으로 유지된다.
 */

import {
  APP_SHELL_FILE,
  classifyPath,
  NOT_FOUND_FILE,
} from "../src/seo/routes";
import { SITE_ORIGIN } from "../src/seo/site";

const CANONICAL_HOST = new URL(SITE_ORIGIN).host;

/** 정본 호스트가 아니면 색인하지 않는다(workers.dev 미리보기 주소 등). */
function isCanonicalHost(host: string): boolean {
  return host === CANONICAL_HOST;
}

async function serveAsset(
  env: Env,
  requestUrl: URL,
  file: string,
  init: { status?: number; robots: string },
): Promise<Response> {
  const asset = await env.ASSETS.fetch(new URL(`/${file}`, requestUrl));
  const response = new Response(asset.body, {
    status: init.status ?? asset.status,
    statusText: init.status ? "" : asset.statusText,
    headers: asset.headers,
  });
  response.headers.set("X-Robots-Tag", init.robots);
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const classification = classifyPath(url.pathname);
    const hostIsCanonical = isCanonicalHost(url.host);

    // 미리 그린 페이지나 법적 고지 문서가 여기까지 왔다는 것은 자산 서빙이
    // 놓쳤다는 뜻이다. 셸을 씌우지 말고 그 문서를 그대로 다시 찾는다.
    if (
      classification.kind === "prerendered" ||
      classification.kind === "static"
    ) {
      const robots = hostIsCanonical
        ? "index, follow, max-image-preview:large"
        : "noindex";
      return serveAsset(env, url, classification.page.file, { robots });
    }

    if (classification.kind === "spa") {
      return serveAsset(env, url, APP_SHELL_FILE, {
        // 정본 호스트가 아니면 follow도 주지 않는다 — 미리보기 도메인의 링크를
        // 따라가 봐야 같은 내용의 다른 호스트만 더 만든다.
        robots: hostIsCanonical ? classification.route.robots : "noindex",
      });
    }

    return serveAsset(env, url, NOT_FOUND_FILE, {
      status: 404,
      robots: "noindex",
    });
  },
} satisfies ExportedHandler<Env>;
