/**
 * 경로별 색인 정책과 메타데이터의 단일 출처.
 *
 * 이 표 하나가 네 곳을 먹인다.
 *  1) `scripts/build-seo.mjs` — 정적으로 만들 공개 페이지의 <head>와 sitemap.xml·robots.txt
 *  2) `worker/index.ts`       — SPA 경로에 붙일 X-Robots-Tag와 "없는 주소" 판정(404)
 *  3) `seo/RouteMetadata.tsx` — 클라이언트 라우팅 후 문서 제목·설명 갱신
 *  4) `test/seo.test.ts`      — 비공개 경로가 sitemap이나 색인 대상에 새지 않는지 확인
 *
 * 새 화면을 App.tsx에 추가하면 여기에도 추가해야 한다. 빠뜨리면 그 주소는
 * 워커가 "없는 주소"로 보고 404를 낸다 — `test/seo-routes.test.ts`가 App.tsx의
 * path 리터럴과 이 표를 대조해 그 실수를 빌드에서 잡는다.
 */

import { SITE_NAME } from "./site";

/** 문서 제목 꼬리표. 공개 랜딩만 예외로 자기 제목을 통째로 쓴다. */
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;

export type RobotsDirective = "index, follow" | "noindex, follow";

/** 빌드 때 실제 HTML로 만들어 내는 공개 페이지. 색인 대상이다. */
export interface PrerenderedPage {
  /** 정본 경로. 끝 슬래시 없음. */
  readonly path: string;
  /**
   * dist에 쓸 파일 이름. 디렉터리 index가 아니라 낱개 .html로 두는 이유는
   * Cloudflare의 `auto-trailing-slash`가 낱개 파일은 끝 슬래시 **없이**,
   * 폴더 index는 끝 슬래시 **있게** 서빙하기 때문이다. 정본을 슬래시 없는
   * 주소로 고정하려면 낱개 파일이어야 한다.
   */
  readonly file: string;
  readonly title: string;
  readonly description: string;
  readonly ogType: "website" | "article";
  /**
   * 이 페이지의 내용을 만드는 파일들(apps/web 기준 상대 경로).
   * sitemap의 `<lastmod>`를 이 파일들의 마지막 커밋 시각에서 뽑는다 —
   * 손으로 적은 날짜는 결국 실제와 어긋나고, 구글은 검증 가능한 lastmod만 쓴다.
   */
  readonly sources: readonly string[];
}

/** 손으로 쓴 정적 HTML(법적 고지·지원). 메타는 그 파일 안에 있다. */
export interface StaticHtmlPage {
  readonly path: string;
  readonly file: string;
  /** sitemap에 넣을지. 색인은 허용하되 안내 성격이라 별도 판단이 필요하다. */
  readonly inSitemap: boolean;
  readonly sources: readonly string[];
}

/** SPA가 그리는 경로. 워커가 셸을 200으로 낸다. */
export interface SpaRoute {
  /** `:param`을 한 세그먼트 와일드카드로 쓰는 경로 패턴. */
  readonly pattern: string;
  readonly title: string;
  readonly robots: RobotsDirective;
}

/**
 * 공개 색인 대상 페이지.
 *
 * 문구 원칙: 실제로 구현된 기능만 말한다. 길이는 한국어 검색결과에서 잘리지
 * 않을 만큼 짧게 둔다(제목 30자 안팎, 설명 100자 안팎).
 */
export const PRERENDERED_PAGES: readonly PrerenderedPage[] = [
  {
    path: "/",
    file: "index.html",
    title: "리브(Leave) — 부대 휴가 일정 공유 캘린더",
    description:
      "부대원의 휴가를 한 달력에서 공유하고, 하루 최대 출타 인원을 넘는 날을 미리 확인하세요. 초과되면 그날 휴가인 부대원 모두에게 알림이 갑니다. 계급 자동 진급과 한국 공휴일 표시까지 웹·앱에서 무료로.",
    ogType: "website",
    sources: [
      "src/pages/LandingPage.tsx",
      "src/pages/landing.css",
      "src/seo/routes.ts",
    ],
  },
  {
    path: "/guide",
    file: "guide.html",
    title: "부대 휴가 일정 조율 가이드 — 리브 사용법",
    description:
      "그룹을 만들어 부대원의 휴가를 한 달력에 모으고, 하루 최대 출타 인원 기준으로 초과일을 확인하는 방법. 계급 자동 진급·전역일·정기외박 주기의 계산 기준까지 정리했습니다.",
    ogType: "article",
    sources: [
      "src/pages/GuidePage.tsx",
      "src/pages/guide.css",
      "src/seo/routes.ts",
    ],
  },
] as const;

/**
 * 법적 고지·지원 문서. `public/`의 손으로 쓴 HTML이 그대로 나간다.
 *
 * sitemap에 넣는다: 스토어 심사와 개인정보 열람권 안내가 걸린 주소라
 * "리브 개인정보 처리방침"·"리브 계정 삭제" 같은 질의에 정확히 답해야 한다.
 */
export const STATIC_HTML_PAGES: readonly StaticHtmlPage[] = [
  {
    path: "/privacy",
    file: "privacy.html",
    inSitemap: true,
    sources: ["public/privacy.html"],
  },
  {
    path: "/terms",
    file: "terms.html",
    inSitemap: true,
    sources: ["public/terms.html"],
  },
  {
    path: "/support",
    file: "support.html",
    inSitemap: true,
    sources: ["public/support.html"],
  },
  {
    path: "/delete-account",
    file: "delete-account.html",
    inSitemap: true,
    sources: ["public/delete-account.html"],
  },
] as const;

/**
 * SPA 경로 전부. 여기 없는 주소는 존재하지 않는 주소다.
 *
 * 전부 noindex인 이유는 경로마다 다르다.
 *  - 로그인·회원가입·초대: 검색 결과에 뜨면 안 되는 인증 흐름이고, 색인해 봐야
 *    사용자가 랜딩 대신 빈 폼에 떨어진다.
 *  - 앱 화면: 서버가 인증을 요구하므로 크롤러에게는 빈 껍데기이고
 *    (= soft 404), 주소 자체가 부대·휴가 구조를 드러낸다.
 *  - `/u/{username}`: 공유·딥링크용 주소지 검색 유입용 페이지가 아니다.
 *    색인하면 별칭과 @아이디가 검색 가능한 명부가 된다. `follow`는 남겨
 *    크롤러가 이 페이지의 홈 링크를 따라갈 수 있게 한다.
 */
export const SPA_ROUTES: readonly SpaRoute[] = [
  { pattern: "/login", title: "로그인", robots: "noindex, follow" },
  { pattern: "/signup", title: "회원가입", robots: "noindex, follow" },
  { pattern: "/invite", title: "그룹 초대", robots: "noindex, follow" },
  { pattern: "/u/:username", title: "공개 프로필", robots: "noindex, follow" },
  { pattern: "/units", title: "내 그룹", robots: "noindex, follow" },
  { pattern: "/units/manage", title: "그룹 관리", robots: "noindex, follow" },
  { pattern: "/leaves", title: "내 휴가", robots: "noindex, follow" },
  { pattern: "/leaves/grants", title: "보유 휴가", robots: "noindex, follow" },
  {
    pattern: "/leaves/:leaveId",
    title: "휴가 상세",
    robots: "noindex, follow",
  },
  { pattern: "/friends", title: "친구", robots: "noindex, follow" },
  { pattern: "/friends/:userId", title: "친구", robots: "noindex, follow" },
  { pattern: "/notifications", title: "알림", robots: "noindex, follow" },
  {
    pattern: "/notifications/settings",
    title: "알림 설정",
    robots: "noindex, follow",
  },
  { pattern: "/profile", title: "프로필", robots: "noindex, follow" },
  {
    pattern: "/service-progress",
    title: "복무 진행률",
    robots: "noindex, follow",
  },
] as const;

/** 로그인한 사용자가 `/`에서 보는 화면. 랜딩과 주소가 같아 표에 따로 둔다. */
export const AUTHED_HOME_TITLE = "부대 달력";

/** 워커가 셸을 낼 때 쓰는 파일. `/app`으로도 닿으므로 자체 noindex를 갖는다. */
export const APP_SHELL_FILE = "app.html";
export const NOT_FOUND_FILE = "404.html";

/** 끝 슬래시를 뗀 경로. Cloudflare가 정적 자산은 이미 정규화하지만 SPA 경로는 아니다. */
export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function matchesPattern(pattern: string, pathname: string): boolean {
  const patternSegments = pattern.split("/");
  const pathSegments = pathname.split("/");
  if (patternSegments.length !== pathSegments.length) return false;
  return patternSegments.every((segment, index) => {
    const actual = pathSegments[index];
    if (actual === undefined) return false;
    if (segment.startsWith(":")) return actual.length > 0;
    return segment === actual;
  });
}

export type PathClassification =
  | { readonly kind: "prerendered"; readonly page: PrerenderedPage }
  | { readonly kind: "static"; readonly page: StaticHtmlPage }
  | { readonly kind: "spa"; readonly route: SpaRoute }
  | { readonly kind: "unknown" };

/** 주소 하나가 무엇인지 판정한다. 워커와 테스트가 같은 함수를 쓴다. */
export function classifyPath(pathname: string): PathClassification {
  const path = normalizePath(pathname);
  const prerendered = PRERENDERED_PAGES.find((page) => page.path === path);
  if (prerendered) return { kind: "prerendered", page: prerendered };
  const staticPage = STATIC_HTML_PAGES.find((page) => page.path === path);
  if (staticPage) return { kind: "static", page: staticPage };
  const spa = SPA_ROUTES.find((route) => matchesPattern(route.pattern, path));
  if (spa) return { kind: "spa", route: spa };
  return { kind: "unknown" };
}

/** sitemap에 실을 항목. 비공개·noindex 경로는 절대 들어가지 않는다. */
export interface SitemapEntry {
  readonly path: string;
  readonly sources: readonly string[];
}

export function sitemapEntries(): readonly SitemapEntry[] {
  return [
    ...PRERENDERED_PAGES.map((page) => ({
      path: page.path,
      sources: page.sources,
    })),
    ...STATIC_HTML_PAGES.filter((page) => page.inSitemap).map((page) => ({
      path: page.path,
      sources: page.sources,
    })),
  ];
}
