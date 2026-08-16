// 스토어 이미지 생성기: Chromium(Playwright)으로 HTML 슬라이드를 PNG로 렌더링.
// 두 스토어 모두 스크린샷/아이콘/피처그래픽에 알파 채널(투명도)을 허용하지 않으므로,
// 렌더 결과 PNG의 알파를 제거(흰 배경 합성)해 colorType 2(RGB)로 재인코딩한다.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { SCREENS, C } from "./screens.mjs";
import { SLIDES, SHOTS, SRC, TINTS, B, framedDevice, bareDevice } from "./shots.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const require = createRequire(path.join(ROOT, "apps/web/package.json"));
const fontRequire = createRequire(path.join(ROOT, "apps/admin/package.json"));
const { chromium } = require("@playwright/test");
const FONT_CSS_PATH = fontRequire.resolve("@fontsource-variable/noto-sans-kr/index.css");
const FONT_DIR = path.join(path.dirname(FONT_CSS_PATH), "files");
const FONT_CSS = fs
  .readFileSync(FONT_CSS_PATH, "utf8")
  .replaceAll("font-display: swap", "font-display: block")
  .replaceAll("url(./files/", "url(https://leave-font.local/");

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
const FONT = `'Noto Sans KR Variable',-apple-system,sans-serif`;
function docHead() {
  return `<meta charset="utf-8"><style>
    ${FONT_CSS}
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
// 휴대전화 슬라이드는 실제 캡처(shots.mjs)를 쓰고, 태블릿만 합성 화면(screens.mjs)을 유지한다.
const TABLET = { logicalW: 1200, logicalH: 1600 };

// ── 실제 캡처 기반 스토어 슬라이드 ─────────────────────────────
// store/assets/screens 의 실제 앱 캡처를 브랜드 민트 배경 위에 합성한다.
// 목업 처리(기울임/베젤/블리드)는 슬라이드마다 다르게 섞어 덱이 단조롭지 않게 한다.
function copyBlock({ W, H, slide, align = "center", onDark = false }) {
  const ink = onDark ? "#ffffff" : B.ink;
  const kick = onDark ? B.primary : B.mid;
  const sub = onDark ? "#dcebd0" : B.inkDeep;
  const em = onDark ? B.primary : B.mid;
  return `
    <div style="width:100%;padding:0 ${Math.round(W * 0.075)}px;text-align:${align};position:relative;z-index:3">
      <div style="font-size:${Math.round(W * 0.029)}px;font-weight:800;letter-spacing:.16em;color:${kick}">${slide.kicker}</div>
      <div style="font-size:${Math.round(W * 0.083)}px;font-weight:900;line-height:1.06;letter-spacing:-.05em;color:${ink};margin-top:${Math.round(H * 0.011)}px">
        ${slide.caption.replaceAll("<em>", `<em style="font-style:normal;color:${em}">`)}
      </div>
      <div style="font-size:${Math.round(W * 0.0335)}px;font-weight:650;line-height:1.36;color:${sub};opacity:.85;margin-top:${Math.round(H * 0.013)}px">${slide.sub}</div>
    </div>`;
}

function orbs(W) {
  return `<div style="position:absolute;top:${-W * 0.22}px;right:${-W * 0.18}px;width:${W * 0.68}px;height:${W * 0.68}px;border-radius:999px;background:rgba(255,255,255,.34)"></div>
    <div style="position:absolute;left:${-W * 0.2}px;top:${W * 0.55}px;width:${W * 0.42}px;height:${W * 0.42}px;border-radius:999px;background:rgba(255,255,255,.22)"></div>`;
}

function captureSlideHTML({ W, H, slide }) {
  const bezel = Math.max(10, Math.round(W * 0.0125));
  const shell = (bg, body) =>
    `<!doctype html><html><head>${docHead()}</head><body>
      <div style="width:${W}px;height:${H}px;background:${bg};position:relative;overflow:hidden">${body}</div>
    </body></html>`;

  if (slide.layout === "wall") {
    const bg = "linear-gradient(158deg,#0e0f0c 0%,#163300 55%,#2f6b12 100%)";
    const cards = slide.features
      .map(
        ([n, t, d]) => `<div style="background:rgba(255,255,255,.07);border:1px solid rgba(159,232,112,.22);border-radius:${Math.round(W * 0.028)}px;padding:${Math.round(W * 0.032)}px">
          <div style="font-size:${Math.round(W * 0.021)}px;font-weight:900;letter-spacing:.14em;color:${B.primary}">${n}</div>
          <div style="font-size:${Math.round(W * 0.034)}px;font-weight:850;color:#fff;margin-top:${Math.round(H * 0.005)}px">${t}</div>
          <div style="font-size:${Math.round(W * 0.023)}px;font-weight:600;color:#c9dcbb;margin-top:${Math.round(H * 0.004)}px;line-height:1.35">${d}</div>
        </div>`,
      )
      .join("");
    return shell(
      bg,
      `${orbs(W)}
      <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.085)}px">${copyBlock({ W, H, slide, onDark: true })}</div>
      <div style="position:absolute;left:${Math.round(W * 0.075)}px;right:${Math.round(W * 0.075)}px;top:${Math.round(H * 0.34)}px;display:grid;grid-template-columns:1fr 1fr;gap:${Math.round(W * 0.025)}px">${cards}</div>
      <div style="position:absolute;left:0;right:0;bottom:${Math.round(H * 0.06)}px;display:flex;align-items:center;justify-content:center;gap:${Math.round(W * 0.022)}px">
        <img src="${ICON_URI}" style="width:${Math.round(W * 0.085)}px;height:${Math.round(W * 0.085)}px;border-radius:${Math.round(W * 0.019)}px"/>
        <div style="text-align:left">
          <div style="font-size:${Math.round(W * 0.038)}px;font-weight:900;color:#fff">리브</div>
          <div style="font-size:${Math.round(W * 0.024)}px;font-weight:600;color:#c9dcbb">휴가 계획을 가볍게</div>
        </div>
      </div>`,
    );
  }

  const bg = TINTS[slide.tint];

  if (slide.layout === "card") {
    // 기기 대신 잘라낸 UI 카드만 크게. 폰이 연달아 나오는 리듬을 끊는다.
    const dev = bareDevice(slide.shot, Math.round(W * 0.94));
    return shell(
      bg,
      `${orbs(W)}
      <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.075)}px">${copyBlock({ W, H, slide })}</div>
      <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.28)}px;height:${Math.round(H * 0.7)}px;display:flex;align-items:center;justify-content:center;z-index:2">
        <div style="transform:rotate(-3deg)">${dev.html}</div>
      </div>`,
    );
  }

  if (slide.layout === "framed") {
    // 기기 전체가 보이는 정면 베젤 목업
    const shot = SHOTS[slide.shot];
    const ratio = shot.cropBottom / SRC.w;
    const region = H * 0.695;
    const screenW = Math.min(W * 0.8, (region - bezel * 2) / ratio);
    const dev = framedDevice(slide.shot, Math.round(screenW), { bezel });
    return shell(
      bg,
      `${orbs(W)}
      <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.055)}px">${copyBlock({ W, H, slide })}</div>
      <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.26)}px;height:${Math.round(region)}px;display:flex;align-items:center;justify-content:center;z-index:2">${dev.html}</div>`,
    );
  }

  // hero / bleed / tilt — 화면이 캔버스 아래로 흘러나가는 구성
  const conf = {
    hero: { screenW: 0.82, top: 0.315, rotate: -3.5, framed: true },
    bleed: { screenW: 0.84, top: 0.32, rotate: 0, framed: false },
    tilt: { screenW: 0.8, top: 0.33, rotate: 4, framed: true },
  }[slide.layout];
  const screenW = Math.round(W * conf.screenW);
  const dev = conf.framed
    ? framedDevice(slide.shot, screenW, { bezel })
    : bareDevice(slide.shot, screenW);

  const chips = (slide.chips || [])
    .map((text, i) => {
      const side = i % 2 === 0 ? `left:${Math.round(W * 0.045)}px` : `right:${Math.round(W * 0.045)}px`;
      const top = Math.round(H * (i === 0 ? 0.52 : 0.66));
      const rot = i % 2 === 0 ? -4 : 4;
      return `<div style="position:absolute;${side};top:${top}px;z-index:4;background:#fff;border-radius:999px;padding:${Math.round(H * 0.011)}px ${Math.round(W * 0.035)}px;font-size:${Math.round(W * 0.028)}px;font-weight:850;color:${B.inkDeep};box-shadow:0 ${Math.round(W * 0.018)}px ${Math.round(W * 0.04)}px rgba(22,51,0,.22);transform:rotate(${rot}deg);white-space:nowrap">${text}</div>`;
    })
    .join("");

  return shell(
    bg,
    `${orbs(W)}
    <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.058)}px">${copyBlock({ W, H, slide })}</div>
    <div style="position:absolute;left:50%;top:${Math.round(H * conf.top)}px;transform:translateX(-50%) rotate(${conf.rotate}deg);z-index:2">${dev.html}</div>
    ${chips}`,
  );
}

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

// 피처 그래픽 1024x500 — 실제 달력 캡처를 기울여 배치
function featureHTML(W, H) {
  const dev = framedDevice("calendar", 250, { bezel: 7 });
  return `<!doctype html><html><head>${docHead()}</head><body>
  <div style="width:${W}px;height:${H}px;background:linear-gradient(120deg,#0e0f0c 0%,#163300 42%,#2f6b12 100%);position:relative;overflow:hidden;display:flex;align-items:center;padding:0 64px">
    <div style="position:absolute;right:-70px;bottom:-150px;width:520px;height:520px;border-radius:999px;background:rgba(159,232,112,.10)"></div>
    <div style="position:absolute;right:210px;top:-110px;width:260px;height:260px;border-radius:999px;background:rgba(255,255,255,.06)"></div>
    <div style="flex:1;z-index:2;padding-right:30px">
      <div style="font-size:20px;font-weight:900;color:${B.primary};letter-spacing:.22em">LEAVE PLANNING</div>
      <div style="font-size:56px;font-weight:900;color:#fff;letter-spacing:-.045em;line-height:1.08;margin-top:16px">휴가 계획은 같이,<br><span style="color:${B.primary}">잔여 관리는 나답게</span></div>
      <div style="font-size:25px;font-weight:650;color:#cfe3c2;margin-top:16px">공유 달력 · 재원별 잔여 · 출타 인원 알림</div>
    </div>
    <div style="z-index:2;width:330px;height:${H}px;position:relative;flex:none">
      <div style="position:absolute;left:30px;top:52px;transform:rotate(-7deg)">${dev.html}</div>
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
  const executablePath = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--force-color-profile=srgb", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route("https://leave-font.local/**", async (route) => {
    const fontName = path.basename(new URL(route.request().url()).pathname);
    if (!fontName.endsWith(".woff2")) {
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: "font/woff2",
      body: fs.readFileSync(path.join(FONT_DIR, fontName)),
    });
  });

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

  // iPhone 6.9" (1320x2868) — 실제 기기 캡처 합성
  for (const s of SLIDES) {
    const html = captureSlideHTML({ W: 1320, H: 2868, slide: s });
    await shoot(page, html, 1320, 2868, path.join(OUT, `appstore/iphone-6.9/${s.id}.png`));
  }
  // iPad 13" (2064x2752)
  for (const s of tabletShots) {
    const html = slideHTML({ W: 2064, H: 2752, caption: s.caption, sub: s.sub, screenHTML: SCREENS[s.screen](), ...TABLET });
    await shoot(page, html, 2064, 2752, path.join(OUT, `appstore/ipad-13/${s.id}.png`));
  }
  await page.close();
  await browser.close();
  const androidBrowser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--force-color-profile=srgb", "--disable-dev-shm-usage"],
  });
  const androidPage = await androidBrowser.newPage({ deviceScaleFactor: 1 });
  await androidPage.route("https://leave-font.local/**", async (route) => {
    const fontName = path.basename(new URL(route.request().url()).pathname);
    if (!fontName.endsWith(".woff2")) {
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: "font/woff2",
      body: fs.readFileSync(path.join(FONT_DIR, fontName)),
    });
  });

  // Android phone (1080x2160, 2:1 이내) — 실제 기기 캡처 합성
  for (const s of SLIDES) {
    const html = captureSlideHTML({ W: 1080, H: 2160, slide: s });
    await shoot(
      androidPage,
      html,
      1080,
      2160,
      path.join(OUT, `googleplay/phone/${s.id}.png`),
    );
  }

  await androidBrowser.close();
  console.log("\n완료: 모든 이미지가", OUT, "에 생성되었습니다.");
};
run().catch((e) => { console.error(e); process.exit(1); });
