/**
 * 소셜 미리보기 이미지(og:image)를 만든다. `pnpm --filter @leave/web og:generate`.
 *
 * 결과물(`public/og/leave-og-1200x630.png`)은 저장소에 커밋한다. 매 빌드마다
 * 브라우저를 띄우지 않기 위해서다 — 브랜드가 바뀔 때만 다시 돌리면 된다.
 * 같은 이유로 `pnpm build`에 넣지 않았다(빌더에 크로미움이 없을 수 있다).
 *
 * 규격은 1.91:1의 1200×630. 카카오톡·iMessage·X·Slack·Discord가 공통으로
 * 잘 다루는 크기다. 글자는 화면에 실제로 있는 문구만 쓰고, 사용자·부대 정보는
 * 담지 않는다.
 *
 * 글꼴은 저장소 안의 서브셋을 파일에서 직접 읽어 넣는다. 시스템 글꼴에 기대면
 * 만드는 기계마다 결과가 달라진다.
 */

import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(webRoot, "public", "og");
const outFile = join(outDir, "leave-og-1200x630.png");

const WIDTH = 1200;
const HEIGHT = 630;

const fontBase64 = readFileSync(
  join(webRoot, "public", "fonts", "pretendard-ui-v1.3.9.woff2"),
).toString("base64");
const markBase64 = readFileSync(
  join(webRoot, "public", "icon-512.png"),
).toString("base64");

/** 랜딩과 같은 토큰을 쓴다(DESIGN.md). */
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><style>
@font-face {
  font-family: "Leave Pretendard UI";
  font-weight: 45 920;
  font-display: block;
  src: url(data:font/woff2;base64,${fontBase64}) format("woff2-variations");
}
* { box-sizing: border-box; margin: 0; }
body {
  width: ${WIDTH}px; height: ${HEIGHT}px;
  display: flex; flex-direction: column; justify-content: space-between;
  padding: 72px 80px;
  background: #163300;
  color: #ffffff;
  font-family: "Leave Pretendard UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.brand { display: flex; align-items: center; gap: 16px; }
.brand img { width: 64px; height: 64px; border-radius: 18px; }
.brand span { font-size: 40px; font-weight: 900; letter-spacing: -0.04em; }
h1 { font-size: 76px; font-weight: 900; line-height: 1.14; letter-spacing: -0.05em; word-break: keep-all; }
h1 em { color: #9fe870; font-style: normal; }
p { margin-top: 22px; font-size: 27px; font-weight: 500; line-height: 1.5; color: #cfe3c0; word-break: keep-all; max-width: 900px; }
.foot { display: flex; align-items: center; justify-content: space-between; font-size: 22px; color: #a9c497; }
.chips { display: flex; gap: 10px; }
.chip { padding: 9px 18px; border: 1px solid rgba(159,232,112,.42); border-radius: 999px; font-size: 20px; font-weight: 600; color: #9fe870; }
</style></head><body>
  <div class="brand">
    <img src="data:image/png;base64,${markBase64}" alt="" />
    <span>리브</span>
  </div>
  <div>
    <h1>부대 휴가 일정,<br /><em>겹치지 않게.</em></h1>
    <p>하루 최대 출타 인원을 넘는 날을 미리 확인하고, 부대원과 함께 조율하세요.</p>
  </div>
  <div class="foot">
    <div class="chips">
      <span class="chip">출타 인원 초과 알림</span>
      <span class="chip">계급 자동 진급</span>
      <span class="chip">한국 공휴일</span>
    </div>
    <span>leave.moveto.kr</span>
  </div>
</body></html>`;

const executablePath = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((candidate) => candidate && existsSync(candidate));

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    "--force-color-profile=srgb",
    "--disable-dev-shm-usage",
    "--no-sandbox",
  ],
});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: "load" });
// 이 화살표 함수는 Node가 아니라 브라우저 안에서 실행된다. .mjs의 eslint
// 설정은 Node 전역만 알고 있으므로 이 한 줄만 예외로 둔다.
// eslint-disable-next-line no-undef
await page.evaluate(() => document.fonts.ready);
const png = await page.screenshot({ type: "png" });
await browser.close();

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, png);
console.log(`[og] ${outFile} — ${WIDTH}x${HEIGHT}, ${png.length} bytes`);
