// 스토어 이미지 생성기: Chromium(Playwright)으로 HTML 슬라이드를 PNG로 렌더링.
// 두 스토어 모두 스크린샷/아이콘/피처그래픽에 알파 채널(투명도)을 허용하지 않으므로,
// 렌더 결과 PNG의 알파를 제거(흰 배경 합성)해 colorType 2(RGB)로 재인코딩한다.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { SCREENS, C } from "./screens.mjs";

const require = createRequire("/home/jhyunwoo/projects/leave/apps/web/");
const { chromium } = require("@playwright/test");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.resolve(__dirname, "..", "images");
const iconB64 = fs
  .readFileSync(path.join(ROOT, "apps/native/assets/images/leave-icon.png"))
  .toString("base64");
const ICON_URI = `data:image/png;base64,${iconB64}`;

// ── PNG utils: 알파 제거(흰 배경 합성) → RGB PNG ────────────────
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function decodePNG(buf) {
  let p = 8; let w, h, bitDepth, colorType, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString("latin1", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("bitDepth " + bitDepth + " unsupported");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels; const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  let rp = 0;
  const paeth = (a, b, c) => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++) {
    const f = raw[rp++]; const line = raw.subarray(rp, rp + stride); rp += stride;
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride); prev = cur;
  }
  return { w, h, channels, data: out };
}
function toRGBflatWhite({ w, h, channels, data }) {
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, o = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (channels === 4) { r = data[i*4]; g = data[i*4+1]; b = data[i*4+2]; a = data[i*4+3]; }
    else if (channels === 3) { r = data[i*3]; g = data[i*3+1]; b = data[i*3+2]; }
    else { r = g = b = data[i]; }
    if (a !== 255) { const t = a / 255; r = Math.round(r*t + 255*(1-t)); g = Math.round(g*t + 255*(1-t)); b = Math.round(b*t + 255*(1-t)); }
    rgb[o++] = r; rgb[o++] = g; rgb[o++] = b;
  }
  return rgb;
}
function encodeRGB(w, h, rgb) {
  const stride = w * 3; const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y*(stride+1)] = 0; rgb.copy(raw, y*(stride+1)+1, y*stride, y*stride+stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function savePngNoAlpha(file, pngBuffer) {
  const dec = decodePNG(pngBuffer);
  const rgb = toRGBflatWhite(dec);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodeRGB(dec.w, dec.h, rgb));
}

// ── HTML shell ─────────────────────────────────────────────────
const FONT = `-apple-system,'Pretendard','Noto Sans KR',sans-serif`;
function docHead() {
  return `<meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:${FONT}}
    html,body{background:#fff}
    .screen-root{width:100%;height:100%;position:relative;overflow:hidden;display:flex;flex-direction:column}
  </style>`;
}
// 슬라이드: 상단 카피 + 하단 기기(스케일된 화면)
function slideHTML({ W, H, caption, sub, screenHTML, logicalW, logicalH, accent }) {
  const capH = Math.round(H * 0.19);
  const marginX = Math.round(W * 0.06);
  const areaH = H - capH - Math.round(H * 0.05);
  const bezel = Math.max(14, Math.round(W * 0.012));
  const kH = (areaH - bezel * 2) / logicalH;
  const kW = (W * 0.82 - bezel * 2) / logicalW;
  const k = Math.min(kH, kW);
  const devW = Math.round(logicalW * k) + bezel * 2;
  const devH = Math.round(logicalH * k) + bezel * 2;
  const screenR = Math.round(bezel * 2.4);
  return `<!doctype html><html><head>${docHead()}</head><body>
  <div style="width:${W}px;height:${H}px;background:linear-gradient(165deg,#f4faee 0%,#d9f1c2 55%,#9fe870 100%);position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center">
    <div style="position:absolute;top:${-W*0.2}px;right:${-W*0.15}px;width:${W*0.6}px;height:${W*0.6}px;border-radius:999px;background:rgba(255,255,255,.28)"></div>
    <div style="height:${capH}px;width:100%;padding:${Math.round(H*0.045)}px ${marginX}px 0;text-align:center;position:relative;z-index:2">
      <div style="font-size:${Math.round(W*0.062)}px;font-weight:800;color:${C.ink};letter-spacing:-1.5px;line-height:1.12">${caption}</div>
      <div style="font-size:${Math.round(W*0.032)}px;font-weight:600;color:${C.inkDeep};opacity:.85;margin-top:${Math.round(H*0.012)}px;line-height:1.35">${sub}</div>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;width:100%;position:relative;z-index:2">
      <div style="width:${devW}px;height:${devH}px;background:#0e0f0c;border-radius:${screenR+bezel}px;padding:${bezel}px;box-shadow:0 ${Math.round(W*0.03)}px ${Math.round(W*0.06)}px rgba(22,51,0,.30)">
        <div style="width:100%;height:100%;border-radius:${screenR}px;overflow:hidden;position:relative;background:#fff">
          <div style="position:absolute;top:0;left:0;width:${logicalW}px;height:${logicalH}px;transform:scale(${k});transform-origin:top left">${screenHTML}</div>
        </div>
      </div>
    </div>
  </div></body></html>`;
}

// ── 콘텐츠 정의 ────────────────────────────────────────────────
const PHONE = { logicalW: 430, logicalH: 930 };
const TABLET = { logicalW: 1200, logicalH: 1600 };

const phoneShots = [
  { id: "01-calendar", screen: "calendar", caption: "그룹 휴가 일정,<br>한 달력에", sub: "가상 별칭과 혼잡 신호로 계획을 참고해요" },
  { id: "02-overage", screen: "dayPanel", caption: "혼잡 신호를<br>미리 확인", sub: "사용자 입력에 따른 추정치이며 공식 승인이 아니에요" },
  { id: "03-register", screen: "leaveForm", caption: "휴가 등록은<br>캘린더처럼 간단히", sub: "제목·기간만 입력하면 끝, 사유는 선택" },
  { id: "04-unit", screen: "unit", caption: "가상 그룹으로<br>기준값 설정", sub: "실제 부대 식별 정보는 입력하지 마세요" },
  { id: "05-notify", screen: "notif", caption: "신호가 바뀌면<br>선택 알림", sub: "필요한 일정 변화만 확인해요" },
  { id: "06-rank", screen: "profile", caption: "개인 휴가 계획을<br>한 화면에", sub: "표시명에는 실명 대신 별칭을 권장해요" },
];
const tabletShots = [
  { id: "01-calendar", screen: "tabletCalendar", caption: "넓은 화면에서 달력과 상세를 나란히", sub: "가상 그룹 일정과 혼잡 신호를 한눈에" },
  { id: "02-register", screen: "tabletUnit", caption: "그룹 확인과 휴가 등록을 한 번에", sub: "사용자 입력에 따른 비공식 계획 참고 도구" },
];

// 아이콘 페이지(풀블리드, 흰 배경 합성)
function iconHTML(size) {
  return `<!doctype html><html><head>${docHead()}</head><body>
  <div style="width:${size}px;height:${size}px;background:#fff;overflow:hidden">
    <img src="${ICON_URI}" style="width:${size}px;height:${size}px;display:block;object-fit:cover"/>
  </div></body></html>`;
}
// 피처 그래픽 1024x500
function featureHTML(W, H) {
  return `<!doctype html><html><head>${docHead()}</head><body>
  <div style="width:${W}px;height:${H}px;background:linear-gradient(120deg,#163300 0%,#2f6b12 45%,#9fe870 100%);position:relative;overflow:hidden;display:flex;align-items:center;padding:0 70px">
    <div style="position:absolute;right:-60px;bottom:-120px;width:520px;height:520px;border-radius:999px;background:rgba(255,255,255,.08)"></div>
    <div style="position:absolute;right:120px;top:-80px;width:260px;height:260px;border-radius:999px;background:rgba(255,255,255,.07)"></div>
    <div style="flex:1;z-index:2">
      <div style="display:flex;align-items:center;gap:20px">
        <img src="${ICON_URI}" style="width:96px;height:96px;border-radius:22px;box-shadow:0 8px 24px rgba(0,0,0,.25)"/>
        <div style="font-size:58px;font-weight:800;color:#fff;letter-spacing:-1px">리브</div>
      </div>
      <div style="font-size:60px;font-weight:800;color:#fff;letter-spacing:-2px;line-height:1.1;margin-top:34px">그룹 휴가, 한 달력에.</div>
      <div style="font-size:30px;font-weight:600;color:#eaf6dc;margin-top:18px;line-height:1.4">입력 일정 기반 혼잡 신호 · 비공식 참고용</div>
    </div>
    <div style="z-index:2;width:300px;height:300px;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.3);border-radius:34px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:22px;margin-right:20px">
      ${Array.from({length:16}).map((_,i)=>{const over=i===6||i===10;return `<div style="border-radius:10px;background:${over?"#d03238":"rgba(255,255,255,.85)"};display:flex;align-items:center;justify-content:center;font-weight:800;color:${over?"#fff":"#163300"};font-size:22px">${i+8}</div>`;}).join("")}
    </div>
  </div></body></html>`;
}

// ── 실행 ───────────────────────────────────────────────────────
async function shoot(page, html, W, H, file, { noAlpha = true } = {}) {
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (noAlpha) savePngNoAlpha(file, buf); else fs.writeFileSync(file, buf);
  console.log("✓", path.relative(OUT, file), `${W}x${H}`);
}

const run = async () => {
  const brandOnly = process.argv.includes("--brand-only");
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  // 아이콘
  await shoot(page, iconHTML(1024), 1024, 1024, path.join(OUT, "appstore/icon/icon-1024.png"));
  await shoot(page, iconHTML(512), 512, 512, path.join(OUT, "googleplay/icon/icon-512.png"));
  // 피처 그래픽
  await shoot(page, featureHTML(1024, 500), 1024, 500, path.join(OUT, "googleplay/feature-graphic/feature-1024x500.png"));
  if (brandOnly) {
    await browser.close();
    console.log("\n완료: 스토어 아이콘과 피처 그래픽을 갱신했습니다.");
    return;
  }

  // iPhone 6.9" (1320x2868)
  for (const s of phoneShots) {
    const html = slideHTML({ W: 1320, H: 2868, caption: s.caption, sub: s.sub, screenHTML: SCREENS[s.screen](), ...PHONE });
    await shoot(page, html, 1320, 2868, path.join(OUT, `appstore/iphone-6.9/${s.id}.png`));
  }
  // iPad 13" (2064x2752)
  for (const s of tabletShots) {
    const html = slideHTML({ W: 2064, H: 2752, caption: s.caption, sub: s.sub, screenHTML: SCREENS[s.screen](), ...TABLET });
    await shoot(page, html, 2064, 2752, path.join(OUT, `appstore/ipad-13/${s.id}.png`));
  }
  // Android phone (1080x2160, 2:1 이내)
  for (const s of phoneShots) {
    const html = slideHTML({ W: 1080, H: 2160, caption: s.caption, sub: s.sub, screenHTML: SCREENS[s.screen](), ...PHONE });
    await shoot(page, html, 1080, 2160, path.join(OUT, `googleplay/phone/${s.id}.png`));
  }

  await browser.close();
  console.log("\n완료: 모든 이미지가", OUT, "에 생성되었습니다.");
};
run().catch((e) => { console.error(e); process.exit(1); });
