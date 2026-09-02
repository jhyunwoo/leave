/**
 * robots.txt와 sitemap.xml 본문을 만든다. 빌드 시에만 쓰인다.
 *
 * ## robots.txt에서 Disallow를 거의 쓰지 않는 이유
 *
 * `Disallow`와 `noindex`는 바꿔 쓸 수 없다. `Disallow`는 "가져가지 마라"이고
 * `noindex`는 "가져가되 검색 결과에 넣지 마라"다. 크롤러가 robots.txt로 막히면
 * 그 페이지의 `noindex`를 **읽을 수 없어서**, 외부 링크만으로 주소가 색인에
 * 남는 일이 생긴다.
 *
 * 리브의 비공개 경로는 전부 워커가 `X-Robots-Tag: noindex`를, 셸 HTML이
 * `<meta name="robots">`를 함께 낸다. 그러니 크롤러는 그것을 읽을 수 있어야
 * 한다 — 그래서 여기서는 막지 않는다.
 *
 * ## 이름을 따로 적은 크롤러
 *
 * robots.txt의 그룹 규칙상, 자기 이름의 그룹이 있으면 그 크롤러는 `*` 그룹을
 * 무시하고 자기 그룹만 본다. 아래 그룹들은 `*`와 내용이 같지만, 네이버
 * 서치어드바이저의 robots.txt 검증과 "이 크롤러를 의도적으로 허용했다"는
 * 기록을 위해 명시한다.
 */

import { sitemapEntries } from "./routes";
import { absoluteUrl, SITE_ORIGIN } from "./site";

const ALLOWED_CRAWLERS: ReadonlyArray<readonly [string, string]> = [
  ["Googlebot", "구글 웹 검색·AI 개요"],
  ["Yeti", "네이버 검색"],
  ["bingbot", "빙 웹 검색 (Copilot의 근거로도 쓰인다)"],
  ["OAI-SearchBot", "ChatGPT 검색의 색인 크롤러 (모델 학습용이 아니다)"],
];

export function buildRobotsTxt(): string {
  const groups = ALLOWED_CRAWLERS.map(
    ([agent, why]) => `# ${why}\nUser-agent: ${agent}\nAllow: /\n`,
  ).join("\n");

  return `# 리브(Leave) — ${SITE_ORIGIN}
#
# 이 파일은 빌드가 만든다. 고치려면 apps/web/src/seo/robots.ts 를 고칠 것.
#
# 비공개 경로(로그인·회원가입·앱 화면·공개 프로필)는 여기서 막지 않는다.
# 대신 워커가 X-Robots-Tag: noindex 를 내고 셸 HTML에 meta robots 가 들어 있다.
# robots.txt로 막으면 크롤러가 그 noindex 를 읽지 못해 오히려 주소만 색인된다.

User-agent: *
Allow: /

${groups}
# 생성형 AI 학습용 크롤러(예: GPTBot, Google-Extended, ClaudeBot, CCBot)는
# 검색 노출과 무관한 별개의 문제다. 지금은 위의 "User-agent: *" 규칙에 따라
# 허용된 상태이며, 이는 이 파일이 없던 지금까지의 상태와 같다. 학습 사용을
# 막으려면 아래 형태의 그룹을 여기에 더한다(검색 노출에는 영향이 없다).
#
#   User-agent: GPTBot
#   Disallow: /
#
# 판단 근거와 크롤러별 차이는 docs/seo.md 참고.

Sitemap: ${absoluteUrl("/sitemap.xml")}
`;
}

/** `<lastmod>`에 쓸 수 있는 시각. 못 구하면 넣지 않는다(틀린 값보다 낫다). */
export type LastModLookup = (sources: readonly string[]) => string | null;

export function buildSitemapXml(lastModFor: LastModLookup): string {
  const urls = sitemapEntries()
    .map((entry) => {
      const lastmod = lastModFor(entry.sources);
      const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
      return `  <url>\n    <loc>${absoluteUrl(entry.path)}</loc>${lastmodTag}\n  </url>`;
    })
    .join("\n");

  // `changefreq`·`priority`는 넣지 않는다 — 구글이 무시한다고 명시했고,
  // 다른 엔진에서도 근거 있는 효과가 확인되지 않는다.
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
