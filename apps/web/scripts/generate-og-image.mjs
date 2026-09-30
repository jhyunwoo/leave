/**
 * 소셜 미리보기 이미지(og:image)를 만든다. `pnpm --filter @leave/web og:generate`.
 *
 * 두 장을 만든다.
 *   - `leave-og-1200x630.png`           브랜드 카드. 공개 페이지와 앱 셸이 쓴다.
 *   - `leave-friend-invite-1200x630.png` 친구 추가 링크(`/u/{username}`) 카드.
 *     문구는 `src/seo/site.ts`의 `FRIEND_INVITE_OG_CARD`를 그대로 읽는다 — 거기
 *     있어야 글꼴 서브셋에 글자가 들어간다(`fonts:generate`는 src의 문자열만 본다).
 *
 * 결과물(`public/og/*.png`)은 저장소에 커밋한다. 매 빌드마다
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
// Node 24는 타입만 벗겨 .ts를 그대로 읽는다. site.ts는 import가 없는 상수 파일이다.
import { FRIEND_INVITE_OG_CARD } from "../src/seo/site.ts";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(webRoot, "public", "og");

const WIDTH = 1200;
const HEIGHT = 630;

const fontBase64 = readFileSync(
  join(webRoot, "public", "fonts", "pretendard-ui-v1.3.9.woff2"),
).toString("base64");
const markBase64 = readFileSync(
  join(webRoot, "public", "icon-512.png"),
).toString("base64");

/** 두 카드가 함께 쓰는 바탕. 랜딩과 같은 토큰을 쓴다(DESIGN.md). */
const baseCss = `
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
`;

const brandMarkup = `<div class="brand">
    <img src="data:image/png;base64,${markBase64}" alt="" />
    <span>리브</span>
  </div>`;

function documentFor(css, body) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><style>${baseCss}${css}</style></head><body>${body}</body></html>`;
}

const brandHtml = documentFor(
  "",
  `
  ${brandMarkup}
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
  </div>`,
);

/**
 * 친구 추가 카드. 카카오톡 미리보기에서 "앱 홍보"가 아니라 "나를 친구로 추가하라는
 * 링크"로 읽혀야 한다. 그래서 오른쪽에 친구 추가 버튼이 달린 프로필 카드를 그려,
 * 글을 읽기 전에 모양만으로 무엇을 하는 링크인지 보이게 한다. 특정 사람의 이름은
 * 넣지 않는다(site.ts 주석).
 */
const card = FRIEND_INVITE_OG_CARD;
const friendInviteHtml = documentFor(
  `
body { flex-direction: row; align-items: stretch; gap: 56px; }
.copy { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.eyebrow { display: inline-flex; align-self: flex-start; margin-bottom: 26px; padding: 8px 18px; border-radius: 999px; background: #9fe870; color: #163300; font-size: 22px; font-weight: 800; }
h1 { font-size: 70px; }
p { font-size: 25px; max-width: 600px; }
.profile { width: 360px; align-self: center; display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 44px 36px; border-radius: 36px; background: #ffffff; color: #163300; box-shadow: 0 24px 60px rgba(0,0,0,.28); }
.avatar { position: relative; width: 132px; height: 132px; border-radius: 50%; background: #e2f6d5; display: grid; place-items: center; }
.avatar svg { width: 76px; height: 76px; }
.plus { position: absolute; right: -6px; bottom: -6px; width: 52px; height: 52px; border-radius: 50%; background: #9fe870; border: 6px solid #ffffff; display: grid; place-items: center; font-size: 34px; font-weight: 900; line-height: 1; color: #163300; }
.lines { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.line { height: 16px; border-radius: 999px; background: #e8ebe6; }
.button { width: 100%; padding: 20px 0; border-radius: 999px; background: #163300; color: #9fe870; text-align: center; font-size: 30px; font-weight: 800; }
`,
  `
  <div class="copy">
    ${brandMarkup}
    <div>
      <span class="eyebrow">${card.eyebrow}</span>
      <h1>${card.headline[0]}<br /><em>${card.headline[1]}</em></h1>
      <p>${card.body}</p>
    </div>
    <div class="foot">
      <div class="chips">
        ${card.chips.map((chip) => `<span class="chip">${chip}</span>`).join("")}
      </div>
    </div>
  </div>
  <div class="profile" aria-hidden="true">
    <div class="avatar">
      <svg viewBox="0 0 24 24" fill="#163300"><circle cx="12" cy="8" r="4.2" /><path d="M3.8 20.4c.9-4.1 4.2-6.6 8.2-6.6s7.3 2.5 8.2 6.6c.1.6-.3 1.1-.9 1.1H4.7c-.6 0-1-.5-.9-1.1z" /></svg>
      <span class="plus">+</span>
    </div>
    <div class="lines">
      <span class="line" style="width: 62%"></span>
      <span class="line" style="width: 40%"></span>
    </div>
    <div class="button">${card.button}</div>
  </div>`,
);

const images = [
  { file: "leave-og-1200x630.png", html: brandHtml },
  { file: "leave-friend-invite-1200x630.png", html: friendInviteHtml },
];

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
mkdirSync(outDir, { recursive: true });
for (const image of images) {
  await page.setContent(image.html, { waitUntil: "load" });
  // 이 화살표 함수는 Node가 아니라 브라우저 안에서 실행된다. .mjs의 eslint
  // 설정은 Node 전역만 알고 있으므로 이 한 줄만 예외로 둔다.
  // eslint-disable-next-line no-undef
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png" });
  const outFile = join(outDir, image.file);
  writeFileSync(outFile, png);
  console.log(`[og] ${outFile} — ${WIDTH}x${HEIGHT}, ${png.length} bytes`);
}
await browser.close();
