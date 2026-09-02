/**
 * 빌드의 마지막 단계 — 공개 페이지를 진짜 HTML로 굽고 robots.txt·sitemap.xml을 쓴다.
 *
 * 실행 순서(`package.json`의 build):
 *   1) `vite build`              브라우저 번들과 dist/index.html(자산 링크가 박힌 틀)
 *   2) `vite build --ssr`        Node에서 돌릴 수 있는 렌더러(dist-prerender/)
 *   3) `node scripts/build-seo.mjs`  ← 여기
 *
 * 하는 일은 넷이다.
 *   - dist/index.html 을 틀로 삼아 공개 페이지마다 <head>와 본문을 채워 넣는다.
 *   - SPA 셸(app.html)과 404 문서(404.html)를 만든다.
 *   - robots.txt 와 sitemap.xml 을 라우트 표에서 만든다.
 *   - 중간 산출물(dist-prerender/)을 지운다.
 *
 * 왜 틀을 dist/index.html에서 가져오는가: 자산 파일 이름에 해시가 붙어 빌드마다
 * 바뀐다. 손으로 적으면 반드시 어긋난다. Vite가 이미 정확히 채워 둔 문서를
 * 그대로 쓰는 것이 유일하게 안전한 방법이다.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(webRoot, "dist");
const ssrDir = join(webRoot, "dist-prerender");

const HEAD_MARKER = /<!--seo-head:[\s\S]*?-->/;
const APP_MARKER = "<!--app-html-->";

function fail(message) {
  console.error(`[build-seo] ${message}`);
  process.exit(1);
}

const ssrEntry = join(ssrDir, "entry-prerender.js");
if (!existsSync(ssrEntry)) {
  fail(`렌더러가 없다: ${ssrEntry} — 'vite build --ssr'가 먼저 돌아야 한다.`);
}

const {
  APP_SHELL_FILE,
  NOT_FOUND_FILE,
  PRERENDERED_PAGES,
  SESSION_FLAG_SCRIPT,
  SITE_NAME,
  TITLE_SUFFIX,
  buildRobotsTxt,
  buildSitemapXml,
  headTagsForNonIndexable,
  headTagsForPage,
  renderNotFound,
  renderRoute,
} = await import(`file://${ssrEntry}`);

const templatePath = join(distDir, "index.html");
if (!existsSync(templatePath)) fail(`틀이 없다: ${templatePath}`);
const template = readFileSync(templatePath, "utf8");

if (!HEAD_MARKER.test(template)) fail("틀에 <!--seo-head--> 자리가 없다.");
if (!template.includes(APP_MARKER)) fail(`틀에 ${APP_MARKER}가 없다.`);

/**
 * 파일들의 마지막 커밋 시각. sitemap의 `<lastmod>`로 쓴다.
 *
 * 구글은 "검증 가능하게 정확한" lastmod만 쓴다고 못 박았다. 손으로 적은 날짜나
 * 빌드 시각을 넣으면 매 배포마다 모든 페이지가 바뀐 것처럼 보여 신호가 죽는다.
 * git을 못 부르는 환경(소스 아카이브만 있는 빌더)에서는 아예 넣지 않는다.
 */
function lastModifiedAt(sources) {
  try {
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", ...sources],
      { cwd: webRoot, stdio: ["ignore", "pipe", "ignore"] },
    )
      .toString()
      .trim();
    return iso.length > 0 ? iso : null;
  } catch {
    return null;
  }
}

/** 틀에 head와 본문을 채워 문서 하나를 만든다. */
function renderDocument({
  head,
  body,
  rootAttributes = "",
  withAppScript = true,
}) {
  // 치환값에 `$&`·`$1` 같은 패턴이 섞여도 그대로 들어가도록 함수 형태로 바꾼다
  // (JSON-LD 문자열에 `$`가 들어갈 수 있다).
  let html = template
    .replace(HEAD_MARKER, () => head)
    .replace(
      `<div id="root">${APP_MARKER}</div>`,
      () => `<div id="root"${rootAttributes}>${body}</div>`,
    );

  if (html.includes(APP_MARKER)) {
    fail("본문 자리(#root)를 못 찾았다 — index.html의 모양이 바뀌었다.");
  }

  if (!withAppScript) {
    // 404는 앱 자바스크립트를 태우지 않는다. 태우면 라우터가 이 주소를
    // 로그인으로 넘겨 soft 404가 된다. CSS 링크는 남겨 화면을 그대로 쓴다.
    html = html.replace(/\n?\s*<script type="module"[^>]*><\/script>/g, "");
    html = html.replace(/\n?\s*<link rel="modulepreload"[^>]*>/g, "");
  }
  return html;
}

const written = [];

// ── 공개 페이지 ─────────────────────────────────────────────────────────
for (const page of PRERENDERED_PAGES) {
  const body = renderRoute(page.path);
  if (body.trim().length === 0) {
    fail(`${page.path} 의 본문이 비었다 — 미리 그리기가 실패했다.`);
  }
  // `/`만 로그인 여부에 따라 다른 화면을 그린다. 그 경우에만 세션 표시
  // 스크립트를 넣어, 첫 페인트 전에 미리 그린 랜딩을 감출 수 있게 한다.
  const bootScript =
    page.path === "/" ? `\n    <script>${SESSION_FLAG_SCRIPT}</script>` : "";
  const html = renderDocument({
    head: `${headTagsForPage(page)}${bootScript}`,
    body,
    rootAttributes: ` data-prerendered="${page.path}"`,
  });
  writeFileSync(join(distDir, page.file), html);
  written.push(`${page.file}  (${page.path})`);
}

// ── SPA 셸 ──────────────────────────────────────────────────────────────
// 워커가 로그인·앱 화면·공개 프로필에 이 문서를 200으로 낸다.
const shellDescription =
  "리브는 부대원의 휴가를 한 달력에서 공유하고 하루 최대 출타 인원 초과일을 미리 알려주는 캘린더입니다.";
writeFileSync(
  join(distDir, APP_SHELL_FILE),
  renderDocument({
    head: headTagsForNonIndexable(SITE_NAME, shellDescription, {
      withSocialCard: true,
    }),
    body: "",
  }),
);
written.push(`${APP_SHELL_FILE}  (SPA 셸)`);

// ── 404 ─────────────────────────────────────────────────────────────────
// 이 화면 고유의 CSS는 브라우저 번들에 없다(NotFoundPage는 앱에서 import되지
// 않는다). 문서에 직접 넣어 자바스크립트도 추가 요청도 없이 완성되게 한다.
const notFoundCss = readFileSync(
  join(webRoot, "src", "pages", "not-found.css"),
  "utf8",
);
writeFileSync(
  join(distDir, NOT_FOUND_FILE),
  renderDocument({
    head: `${headTagsForNonIndexable(
      `페이지를 찾을 수 없어요${TITLE_SUFFIX}`,
      "요청한 주소에 해당하는 페이지가 없습니다.",
      { withSocialCard: false },
    )}\n    <style>${notFoundCss}</style>`,
    body: renderNotFound(),
    withAppScript: false,
  }),
);
written.push(`${NOT_FOUND_FILE}  (404 본문)`);

// ── robots.txt · sitemap.xml ────────────────────────────────────────────
writeFileSync(join(distDir, "robots.txt"), buildRobotsTxt());
written.push("robots.txt");

writeFileSync(join(distDir, "sitemap.xml"), buildSitemapXml(lastModifiedAt));
written.push("sitemap.xml");

// public/에 사본을 두지 않는다. 커밋마다 lastmod가 바뀌어 저장소에 잡음만
// 남고, 개발 서버는 이 두 파일이 없어도 아무 문제가 없다.

rmSync(ssrDir, { recursive: true, force: true });

console.log(`[build-seo] 만들었다:\n  - ${written.join("\n  - ")}`);
