/**
 * 정적으로 만들어 내는 HTML의 <head> 조각을 만든다.
 *
 * 사용처: `scripts/build-seo.mjs`(빌드 시). 브라우저 번들에는 들어가지 않는다.
 * 런타임에 문서 제목을 갱신하는 쪽은 `RouteMetadata.tsx`가 맡는다.
 */

import type { PrerenderedPage } from "./routes";
import { structuredDataFor } from "./structured-data";
import {
  absoluteUrl,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  SITE_LOCALE,
  SITE_NAME,
} from "./site";

/** 속성값에 그대로 넣어도 안전하게. 페이지 문구에 따옴표·꺾쇠가 섞일 수 있다. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 색인 대상 페이지의 robots. `max-image-preview:large`는 이미지 미리보기를 크게,
 * `max-snippet:-1`은 스니펫 길이 제한을 풀어 검색결과 표현을 넓힌다.
 */
export const INDEXABLE_ROBOTS =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

/**
 * 첫 페인트 전에 세션 유무를 알려 주는 최소 스크립트.
 *
 * 랜딩은 정적으로 미리 그려져 있어 HTML만으로 바로 보인다. 그런데 이미
 * 로그인한 사람이 `/`를 열면 그 홍보 화면이 잠깐 보였다가 앱으로 바뀐다.
 * 이 스크립트가 <html>에 표시를 남기면 CSS가 첫 페인트 전에 미리 그린 조각을
 * 감춰, 로그인 사용자의 화면 전환이 지금과 똑같이 유지된다.
 *
 * 인라인인 이유: 외부 파일로 두면 렌더를 막는 왕복이 하나 늘어 정작 검색
 * 유입(비로그인)의 LCP가 나빠진다. CSP는 `'unsafe-inline'` 대신 이 문자열의
 * sha256 해시 하나만 허용한다(`public/_headers`). 내용이 바뀌면
 * `test/seo-headers.test.ts`가 새 해시를 알려 준다.
 */
export const SESSION_FLAG_SCRIPT =
  'try{if(localStorage.getItem("leave.token"))document.documentElement.setAttribute("data-session","1")}catch(e){}';

function metaTag(attr: "name" | "property", key: string, value: string) {
  return `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
}

/** 공개(색인 대상) 페이지의 head 태그 묶음. */
export function headTagsForPage(page: PrerenderedPage): string {
  const canonical = absoluteUrl(page.path);
  const image = absoluteUrl(OG_IMAGE_PATH);
  return [
    `<title>${escapeHtml(page.title)}</title>`,
    metaTag("name", "description", page.description),
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    metaTag("name", "robots", INDEXABLE_ROBOTS),
    metaTag("property", "og:type", page.ogType),
    metaTag("property", "og:site_name", SITE_NAME),
    metaTag("property", "og:locale", SITE_LOCALE),
    metaTag("property", "og:title", page.title),
    metaTag("property", "og:description", page.description),
    metaTag("property", "og:url", canonical),
    metaTag("property", "og:image", image),
    metaTag("property", "og:image:width", String(OG_IMAGE_WIDTH)),
    metaTag("property", "og:image:height", String(OG_IMAGE_HEIGHT)),
    metaTag("property", "og:image:alt", OG_IMAGE_ALT),
    metaTag("name", "twitter:card", "summary_large_image"),
    metaTag("name", "twitter:title", page.title),
    metaTag("name", "twitter:description", page.description),
    metaTag("name", "twitter:image", image),
    metaTag("name", "twitter:image:alt", OG_IMAGE_ALT),
    `<script type="application/ld+json">${structuredDataFor(page).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
}

/**
 * SPA 셸과 404처럼 색인하지 않는 문서의 head 태그.
 *
 * 셸에도 소셜 미리보기 태그를 넣는다. `/u/{username}` 링크를 카카오톡이나
 * 메신저에 붙였을 때 미리보기가 비지 않게 하기 위해서다. 사람마다 다른 값을
 * 넣지 않는다 — 공개 프로필의 별칭·아이디를 미리보기로 퍼뜨리지 않는 것이
 * 이 화면의 목적에 맞는다. `og:url`도 넣지 않는다(주소가 문서마다 다르다).
 */
export function headTagsForNonIndexable(
  title: string,
  description: string,
  options: { readonly withSocialCard: boolean },
): string {
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    metaTag("name", "description", description),
    metaTag("name", "robots", "noindex, follow"),
  ];
  if (options.withSocialCard) {
    const image = absoluteUrl(OG_IMAGE_PATH);
    tags.push(
      metaTag("property", "og:type", "website"),
      metaTag("property", "og:site_name", SITE_NAME),
      metaTag("property", "og:locale", SITE_LOCALE),
      metaTag("property", "og:title", title),
      metaTag("property", "og:description", description),
      metaTag("property", "og:image", image),
      metaTag("property", "og:image:width", String(OG_IMAGE_WIDTH)),
      metaTag("property", "og:image:height", String(OG_IMAGE_HEIGHT)),
      metaTag("property", "og:image:alt", OG_IMAGE_ALT),
      metaTag("name", "twitter:card", "summary_large_image"),
      metaTag("name", "twitter:title", title),
      metaTag("name", "twitter:description", description),
      metaTag("name", "twitter:image", image),
      metaTag("name", "twitter:image:alt", OG_IMAGE_ALT),
    );
  }
  return tags.join("\n    ");
}
