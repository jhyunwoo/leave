/**
 * 빌드 산출물(dist/)을 그대로 읽어 검사한다.
 *
 * 여기서 확인하는 것은 "자바스크립트를 실행하지 않은 크롤러가 받는 것"이다.
 * 렌더링된 DOM이 아니라 **HTTP 응답 본문**을 보는 것이 요점이라, 브라우저를
 * 띄우지 않고 파일을 문자열로 읽는다.
 *
 * `turbo.json`이 이 패키지의 test를 build에 걸어 두었으므로 dist는 항상 있다.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { PRERENDERED_PAGES, STATIC_HTML_PAGES } from "../src/seo/routes";
import { OG_IMAGE_PATH, SITE_ORIGIN } from "../src/seo/site";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(webRoot, "dist");

function read(file: string): string {
  return readFileSync(join(dist, file), "utf8");
}

function metaContent(html: string, attr: string, key: string): string | null {
  const pattern = new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`, "i");
  return pattern.exec(html)?.[1] ?? null;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

beforeAll(() => {
  if (!existsSync(join(dist, "index.html"))) {
    throw new Error(
      "dist/가 없다 — 'pnpm --filter @leave/web build'를 먼저 돌린다.",
    );
  }
});

describe.each(PRERENDERED_PAGES)("공개 페이지 $path", (page) => {
  let html = "";
  beforeAll(() => {
    html = read(page.file);
  });

  it("표의 제목·설명을 그대로 담는다", () => {
    expect(html).toContain(`<title>${page.title}</title>`);
    expect(metaContent(html, "name", "description")).toBe(page.description);
  });

  it("한국어 검색결과에서 잘리지 않을 길이다", () => {
    expect(page.title.length).toBeLessThanOrEqual(40);
    expect(page.description.length).toBeGreaterThanOrEqual(60);
    expect(page.description.length).toBeLessThanOrEqual(200);
  });

  it("정본 주소를 운영 오리진으로 가리킨다", () => {
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    expect(canonical).toBe(
      page.path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${page.path}`,
    );
    expect(canonical).not.toContain("?");
    expect(canonical).not.toContain("workers.dev");
    expect(canonical).not.toContain("localhost");
  });

  it("색인을 허용한다", () => {
    expect(metaContent(html, "name", "robots")).toMatch(/^index, follow/);
  });

  it("소셜 미리보기가 갖춰져 있다", () => {
    expect(metaContent(html, "property", "og:title")).toBe(page.title);
    expect(metaContent(html, "property", "og:description")).toBe(
      page.description,
    );
    expect(metaContent(html, "property", "og:locale")).toBe("ko_KR");
    expect(metaContent(html, "property", "og:site_name")).toBe("리브");
    expect(metaContent(html, "property", "og:image")).toBe(
      `${SITE_ORIGIN}${OG_IMAGE_PATH}`,
    );
    expect(metaContent(html, "property", "og:image:width")).toBe("1200");
    expect(metaContent(html, "property", "og:image:height")).toBe("630");
    expect(metaContent(html, "name", "twitter:card")).toBe(
      "summary_large_image",
    );
  });

  it("H1이 정확히 하나다", () => {
    expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
  });

  it("제목 계층이 h1 → h2 순서로 시작한다", () => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) =>
      Number(m[1]),
    );
    expect(levels[0]).toBe(1);
    // 한 단계씩만 깊어진다(h2 다음에 h4가 오지 않는다).
    for (let i = 1; i < levels.length; i += 1) {
      const previous = levels[i - 1] ?? 1;
      const current = levels[i] ?? 1;
      expect(current - previous).toBeLessThanOrEqual(1);
    }
  });

  it("JSON-LD가 파싱되고 빈 값이 없다", () => {
    const raw =
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
        html,
      )?.[1];
    expect(raw, "JSON-LD 블록이 없다").toBeTruthy();
    const parsed = JSON.parse(raw ?? "") as Record<string, unknown>;
    expect(parsed["@context"]).toBe("https://schema.org");
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("undefined");
    expect(serialized).not.toContain("null");
    expect(serialized).not.toContain("localhost");
  });

  it("구조화 데이터가 지어낸 평점·가격을 담지 않는다", () => {
    const raw =
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
        html,
      )?.[1] ?? "";
    expect(raw).not.toContain("aggregateRating");
    expect(raw).not.toContain("reviewCount");
    expect(raw).not.toContain("ratingValue");
    // 무료가 사실일 때만 0원을 적는다.
    if (raw.includes('"price"')) expect(raw).toContain('"price":"0"');
  });

  it("본문이 자바스크립트 없이 읽힌다", () => {
    const text = stripTags(html.split("<body>")[1] ?? "");
    expect(text.length).toBeGreaterThan(1200);
    expect(text).toContain("리브");
  });
});

describe("홈 문서", () => {
  const html = read("index.html");
  const text = stripTags(html.split("<body>")[1] ?? "");

  it("브랜드·핵심 가치·주요 기능이 모두 본문에 있다", () => {
    for (const phrase of [
      "리브",
      "부대 휴가 일정",
      "하루 최대 출타 인원",
      "계급",
      "공휴일",
      "정기외박",
      "개인 일정",
      "무료",
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  it("공식 서비스가 아님을 본문에서 밝힌다", () => {
    expect(text).toContain("국방부");
    expect(text).toContain("무관");
  });

  it("공개 페이지로 가는 크롤 가능한 링크를 갖는다", () => {
    for (const href of ["/guide", "/privacy", "/terms", "/support"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("미리 그린 표시와 세션 판별 스크립트가 들어 있다", () => {
    expect(html).toContain('id="root" data-prerendered="/"');
    expect(html).toContain("data-session");
  });
});

describe("SPA 셸(app.html)", () => {
  const html = read("app.html");

  it("색인되지 않는다", () => {
    expect(metaContent(html, "name", "robots")).toBe("noindex, follow");
  });

  it("본문이 비어 있고 앱 번들을 싣는다", () => {
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/<script type="module"[^>]*src="\/assets\//);
  });

  it("공유 미리보기는 있되 사용자 정보는 없다", () => {
    expect(metaContent(html, "property", "og:image")).toContain(OG_IMAGE_PATH);
    // 주소마다 달라지는 값은 정적 셸에 담을 수 없다.
    expect(html).not.toContain("og:url");
  });
});

describe("404 문서", () => {
  const html = read("404.html");

  it("색인되지 않는다", () => {
    expect(metaContent(html, "name", "robots")).toBe("noindex, follow");
  });

  it("앱 자바스크립트를 싣지 않는다", () => {
    // 태우면 라우터가 이 주소를 로그인으로 넘겨 soft 404가 된다.
    expect(html).not.toContain('<script type="module"');
    expect(html).not.toContain("modulepreload");
  });

  it("사람이 읽을 안내와 홈 링크가 있다", () => {
    expect(html).toContain("페이지를 찾을 수 없어요");
    expect(html).toContain('href="/"');
    expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
  });
});

describe("정적 파일", () => {
  it("robots.txt가 사이트맵을 알리고 아무것도 막지 않는다", () => {
    const txt = read("robots.txt");
    expect(txt).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(txt).not.toMatch(/^Disallow:/m);
  });

  it("sitemap.xml이 유효한 XML이고 공개 페이지만 담는다", () => {
    const xml = read("sitemap.xml");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    for (const forbidden of ["/login", "/signup", "/u/", "/units", "/app"]) {
      expect(xml, forbidden).not.toContain(forbidden);
    }
  });

  it("소셜 이미지가 존재한다", () => {
    expect(existsSync(join(dist, OG_IMAGE_PATH.replace(/^\//, "")))).toBe(true);
  });

  it("법적 고지 문서가 그대로 나간다", () => {
    for (const page of STATIC_HTML_PAGES) {
      const html = read(page.file);
      expect(html, page.file).toMatch(/<title>[^<]+<\/title>/);
      expect(html, page.file).toContain('lang="ko"');
      expect(html, page.file).toContain("charset");
      expect(html, page.file).toContain("viewport");
    }
  });

  it("앱 연결 파일(딥링크)이 그대로 남아 있다", () => {
    const aasa = JSON.parse(read(".well-known/apple-app-site-association")) as {
      applinks: { details: { components: { "/": string }[] }[] };
    };
    expect(aasa.applinks.details[0]?.components[0]?.["/"]).toBe("/u/*");
    const assetlinks = JSON.parse(read(".well-known/assetlinks.json")) as {
      target: { package_name: string };
    }[];
    expect(assetlinks[0]?.target.package_name).toBe("app.leave.mobile");
  });

  it("빌드 표시자가 남지 않는다", () => {
    for (const file of ["index.html", "guide.html", "app.html", "404.html"]) {
      expect(read(file), file).not.toContain("seo-head");
      expect(read(file), file).not.toContain("app-html");
    }
  });
});
