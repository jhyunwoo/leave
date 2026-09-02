/**
 * 색인 정책의 회귀 테스트 — 소스만 읽는다(빌드 산출물은 seo-build.test.ts).
 *
 * 가장 중요한 것은 마지막 묶음이다. 워커는 `SPA_ROUTES`에 없는 주소를
 * "없는 주소"로 보고 404를 낸다. 그래서 App.tsx에 화면을 추가하고 표를
 * 빠뜨리면 그 화면이 새로고침에서 404가 된다 — 그 실수를 여기서 잡는다.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyPath,
  normalizePath,
  PRERENDERED_PAGES,
  sitemapEntries,
  SPA_ROUTES,
  STATIC_HTML_PAGES,
} from "../src/seo/routes";
import { buildRobotsTxt, buildSitemapXml } from "../src/seo/robots";
import { SITE_ORIGIN } from "../src/seo/site";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** `:leaveId`와 `:id`의 차이로 테스트가 깨지지 않게 파라미터 이름을 지운다. */
function normalizeParams(path: string): string {
  return path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":param" : segment))
    .join("/");
}

describe("경로 판정", () => {
  it("공개 페이지는 미리 그린 문서로 판정된다", () => {
    expect(classifyPath("/").kind).toBe("prerendered");
    expect(classifyPath("/guide").kind).toBe("prerendered");
    // 끝 슬래시가 붙어도 같은 페이지다.
    expect(classifyPath("/guide/").kind).toBe("prerendered");
  });

  it("법적 고지는 정적 문서로 판정된다", () => {
    for (const page of STATIC_HTML_PAGES) {
      expect(classifyPath(page.path).kind).toBe("static");
    }
  });

  it("SPA 경로는 셸을 받고 전부 noindex다", () => {
    for (const route of SPA_ROUTES) {
      const probe = route.pattern.replace(/:[^/]+/g, "sample");
      const result = classifyPath(probe);
      expect(result.kind, route.pattern).toBe("spa");
      if (result.kind !== "spa") return;
      expect(result.route.robots, route.pattern).toMatch(/^noindex/);
    }
  });

  it("공개 프로필은 색인하지 않되 링크는 따라가게 둔다", () => {
    const result = classifyPath("/u/hyunwoo");
    expect(result.kind).toBe("spa");
    if (result.kind !== "spa") return;
    // follow를 남기는 이유: 이 페이지의 홈 링크를 크롤러가 따라갈 수 있어야 한다.
    expect(result.route.robots).toBe("noindex, follow");
  });

  it("표에 없는 주소는 404 대상이다", () => {
    for (const path of [
      "/nope",
      "/units/manage/extra",
      "/u/a/b",
      "/wp-admin",
      "/leaves/grants/x",
    ]) {
      expect(classifyPath(path).kind, path).toBe("unknown");
    }
  });

  it("끝 슬래시를 뗀 경로로 판정한다", () => {
    expect(normalizePath("/login/")).toBe("/login");
    expect(normalizePath("/")).toBe("/");
    expect(classifyPath("/login/").kind).toBe("spa");
  });
});

describe("sitemap", () => {
  const xml = buildSitemapXml(() => "2026-09-01T00:00:00Z");

  it("색인 대상 공개 페이지만 담는다", () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(
      sitemapEntries().map(
        (entry) => `${SITE_ORIGIN}${entry.path === "/" ? "/" : entry.path}`,
      ),
    );
  });

  it("비공개·인증 경로가 새지 않는다", () => {
    for (const route of SPA_ROUTES) {
      const segment = route.pattern.split("/")[1] ?? "";
      expect(xml, route.pattern).not.toContain(`/${segment}<`);
    }
    for (const forbidden of [
      "/login",
      "/signup",
      "/invite",
      "/u/",
      "/units",
      "/leaves",
      "/friends",
      "/notifications",
      "/profile",
      "/service-progress",
      "/app",
      "/404",
      "api.leave.moveto.kr",
    ]) {
      expect(xml, forbidden).not.toContain(forbidden);
    }
  });

  it("lastmod를 구할 수 없으면 아예 넣지 않는다", () => {
    const withoutDates = buildSitemapXml(() => null);
    expect(withoutDates).not.toContain("lastmod");
    expect(withoutDates).toContain("<loc>");
  });

  it("구글이 무시하는 값은 넣지 않는다", () => {
    expect(xml).not.toContain("changefreq");
    expect(xml).not.toContain("priority");
  });

  it("정본 오리진만 쓴다", () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1] ?? "",
    );
    for (const loc of locs)
      expect(loc.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
  });
});

describe("robots.txt", () => {
  const txt = buildRobotsTxt();

  it("사이트맵을 알린다", () => {
    expect(txt).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });

  it("검색 크롤러를 막지 않는다", () => {
    // noindex를 읽게 하려면 가져갈 수 있어야 한다. Disallow가 하나라도 생기면
    // 그 경로의 noindex가 무력해진다.
    const directives = txt
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .filter((line) => line.trim().length > 0);
    expect(directives.some((line) => line.startsWith("Disallow:"))).toBe(false);
  });

  it("네이버·빙·ChatGPT 검색 크롤러를 명시한다", () => {
    for (const agent of ["Yeti", "bingbot", "OAI-SearchBot", "Googlebot"]) {
      expect(txt).toContain(`User-agent: ${agent}`);
    }
  });

  it("학습용 크롤러 정책은 주석으로만 남기고 결정하지 않는다", () => {
    expect(txt).toContain("GPTBot");
    // 실제 규칙 줄로는 들어가지 않는다.
    expect(txt).not.toMatch(/^User-agent: GPTBot/m);
  });
});

describe("App.tsx의 라우트와 표가 어긋나지 않는다", () => {
  const appSource = readFileSync(join(webRoot, "src", "App.tsx"), "utf8");

  const declaredPaths = [...appSource.matchAll(/path="([^"]+)"/g)]
    .map((match) => match[1] ?? "")
    .filter((path) => path !== "*")
    .map((path) => normalizeParams(path.startsWith("/") ? path : `/${path}`));

  const knownPaths = new Set(
    [
      ...SPA_ROUTES.map((route) => route.pattern),
      ...PRERENDERED_PAGES.map((page) => page.path),
    ].map(normalizeParams),
  );

  it("App.tsx가 그리는 모든 경로가 표에 있다", () => {
    expect(declaredPaths.length).toBeGreaterThan(10);
    const missing = declaredPaths.filter((path) => !knownPaths.has(path));
    expect(
      missing,
      "src/seo/routes.ts 에 추가하지 않으면 새로고침에서 404가 된다",
    ).toEqual([]);
  });

  it("표에만 있고 App.tsx에 없는 경로가 없다", () => {
    const declared = new Set(declaredPaths);
    // `/` 는 index 라우트라 path 속성이 없다.
    const stale = SPA_ROUTES.map((route) =>
      normalizeParams(route.pattern),
    ).filter((pattern) => !declared.has(pattern));
    expect(stale).toEqual([]);
  });
});
