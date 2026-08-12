// 스토어 이미지 생성기: Chromium(Playwright)으로 HTML 슬라이드를 PNG로 렌더링.
// 두 스토어 모두 스크린샷/아이콘/피처그래픽에 알파 채널(투명도)을 허용하지 않으므로,
// 렌더 결과 PNG의 알파를 제거(흰 배경 합성)해 colorType 2(RGB)로 재인코딩한다.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { SCREENS, C } from "./screens.mjs";

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
const PHONE = { logicalW: 430, logicalH: 930 };
const TABLET = { logicalW: 1200, logicalH: 1600 };

const phoneShots = [
  { id: "01-calendar", screen: "calendar", caption: "우리 휴가,<br><span style='color:#2f6b12'>한눈에</span>", sub: "함께 계획하고 겹치는 날을 먼저 확인하세요" },
  { id: "02-overage", screen: "dayPanel", caption: "겹치는 날,<br><span style='color:#a72027'>계획 전에</span>", sub: "사용자 일정과 그룹 기준값으로 날짜별 혼잡 신호를 봐요" },
  { id: "03-register", screen: "leaveForm", caption: "휴가 등록은<br><span style='color:#2f6b12'>캘린더처럼</span>", sub: "제목과 기간만 고르면 계획이 바로 달력에" },
  { id: "04-unit", screen: "unit", caption: "우리끼리<br><span style='color:#2f6b12'>기준을 맞춰요</span>", sub: "가상 그룹을 만들고 하루 최대 출타 인원을 정해요" },
  { id: "05-notify", screen: "notif", caption: "변화가 생기면<br><span style='color:#2f6b12'>바로 알림</span>", sub: "필요한 혼잡 신호 변화만 선택해서 확인하세요" },
  { id: "06-balance", kind: "balance" },
  { id: "07-overnight", kind: "overnight" },
  { id: "08-more", kind: "more" },
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
    <div style="flex:1;z-index:2;padding-right:36px">
      <div style="font-size:22px;font-weight:800;color:#9fe870;letter-spacing:5px">LEAVE PLANNING</div>
      <div style="font-size:58px;font-weight:850;color:#fff;letter-spacing:-2px;line-height:1.08;margin-top:18px">휴가 계획은 같이,<br>잔여 관리는 나답게</div>
      <div style="font-size:27px;font-weight:650;color:#eaf6dc;margin-top:18px;line-height:1.4">공유 캘린더 · 재원별 잔여 · 정기외박</div>
    </div>
    <div style="z-index:2;width:300px;height:300px;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.3);border-radius:34px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:22px;margin-right:20px">
      ${Array.from({length:16}).map((_,i)=>{const over=i===6||i===10;return `<div style="border-radius:10px;background:${over?"#d03238":"rgba(255,255,255,.85)"};display:flex;align-items:center;justify-content:center;font-weight:800;color:${over?"#fff":"#163300"};font-size:22px">${i+8}</div>`;}).join("")}
    </div>
  </div></body></html>`;
}

// 개인 휴가 관리·정기외박·마무리 슬라이드.
// 실제 앱의 정보 구조와 브랜드 토큰을 따르되, 군 식별 정보가 없는 가상 데이터만 쓴다.
function marketingSlideHTML({ W, H, kind }) {
  const balanceRows = [
    ["연가", "18일", "#4f6ee8", "#edf1ff"],
    ["포상휴가", "6일", "#db7f14", "#fff0db"],
    ["위로휴가", "4일", "#c04b75", "#fdeaf1"],
    ["청원휴가", "3일", "#168f85", "#e3f6f3"],
    ["정기외박", "4일", "#8a55be", "#f5eafe"],
  ];
  const balanceVisual =
    '<div class="app-card app-dark">' +
      '<div class="eyebrow green">내 휴가 현황</div>' +
      '<div class="metric">남은 휴가 35일</div>' +
      '<div class="muted-on-dark">사용 12일 · 총 47일</div>' +
      '<div class="progress"><i style="width:25%;background:#9fe870"></i><i style="width:75%;background:#fff"></i></div>' +
      '<div class="footnote-on-dark">만기가 빠른 적립분부터 자동 차감</div>' +
    '</div>' +
    '<div class="rows">' +
      balanceRows.map(function (row) {
        return '<div class="balance-row"><i style="background:' + row[2] + '"></i><b>' + row[0] + '</b><span style="color:' + row[2] + ';background:' + row[3] + '">' + row[1] + '</span></div>';
      }).join('') +
    '</div>';

  const overnightVisual =
    '<div class="app-card purple">' +
      '<div class="topline"><b>5주기 · 이번 주기</b><span>자동 적립 켜짐</span></div>' +
      '<div class="metric">남은 정기외박 2일</div>' +
      '<div class="muted-on-purple">8/23–10/3 안에 사용 · 이월 없음</div>' +
      '<div class="progress purple-track"><i style="width:34%;background:#fff"></i></div>' +
    '</div>' +
    '<div class="setting"><div><b>자동 적립 설정</b><small>사용자 설정 예시</small></div><div class="toggle"><i></i></div></div>' +
    '<div class="setting-grid"><div><small>주기</small><b>42일</b></div><div><small>회당 적립</small><b>3일</b></div><div><small>다음 적립</small><b>10/4</b></div></div>' +
    '<div class="cycles">' +
      '<div><i></i><b>4주기</b><small>7/12–8/22</small><strong>3/3일</strong></div>' +
      '<div class="current"><i></i><b>5주기</b><small>8/23–10/3</small><strong>잔여 2일</strong></div>' +
      '<div><i></i><b>6주기</b><small>10/4–11/14</small><strong>예정</strong></div>' +
    '</div>';

  const moreVisual =
    '<div class="feature-grid">' +
      '<div><span>01</span><b>공유 캘린더</b><small>함께 보는 휴가 계획</small></div>' +
      '<div><span>02</span><b>혼잡 신호</b><small>겹치는 날 미리 확인</small></div>' +
      '<div><span>03</span><b>재원별 잔여</b><small>연가부터 청원휴가까지</small></div>' +
      '<div><span>04</span><b>정기외박 주기</b><small>적립과 사용량 자동 계산</small></div>' +
      '<div><span>05</span><b>변경 알림</b><small>필요한 변화만 선택</small></div>' +
      '<div><span>06</span><b>가상 그룹</b><small>민감 정보 없이 계획</small></div>' +
    '</div>' +
    '<div class="brand-lockup"><img src="' + ICON_URI + '"><div><b>리브</b><small>휴가 계획을 가볍게</small></div></div>';

  const data = {
    balance: {
      eyebrow: "PERSONAL LEAVE",
      caption: "남은 휴가,<br><em>재원별로</em>",
      sub: "연가·포상·위로·청원휴가의 잔여와 만기를 한눈에",
      visual: balanceVisual,
      theme: "light",
    },
    overnight: {
      eyebrow: "AIR FORCE · NAVY",
      caption: "정기외박,<br><em>주기까지 자동</em>",
      sub: "반복 적립과 주기별 사용량을 내 설정에 맞춰 계산해요",
      visual: overnightVisual,
      theme: "lavender",
    },
    more: {
      eyebrow: "LEAVE, SIMPLIFIED",
      caption: "휴가 계획의<br><em>처음부터 끝까지</em>",
      sub: "함께 세우는 계획과 내 휴가 관리를 리브 하나로",
      visual: moreVisual,
      theme: "dark",
    },
  };
  const d = data[kind];
  const dark = d.theme === "dark";
  const bg = dark
    ? "linear-gradient(155deg,#0e0f0c 0%,#163300 58%,#2f6b12 100%)"
    : d.theme === "lavender"
      ? "linear-gradient(155deg,#f7f1fb 0%,#eadcf5 58%,#c9a8e3 100%)"
      : "linear-gradient(155deg,#f4faee 0%,#e2f6d5 58%,#9fe870 100%)";
  const ink = dark ? "#fff" : C.ink;
  const subInk = dark ? "#dce9d5" : C.inkDeep;
  const accent = dark ? C.primary : d.theme === "lavender" ? "#8a55be" : C.inkDeep;

  return '<!doctype html><html><head>' + docHead() + '<style>' +
    'body{overflow:hidden}.marketing{width:' + W + 'px;height:' + H + 'px;background:' + bg + ';color:' + ink + ';padding:5.2vh 6vw;position:relative;overflow:hidden}' +
    '.orb{position:absolute;border-radius:999px;background:rgba(255,255,255,.18)}.orb.one{width:55vw;height:55vw;right:-18vw;top:-16vw}.orb.two{width:30vw;height:30vw;left:-12vw;bottom:20vh}' +
    '.copy{position:relative;z-index:2;text-align:center}.kicker{font-size:2.4vw;font-weight:800;letter-spacing:.18em;color:' + accent + '}.headline{font-size:7.2vw;line-height:1.05;font-weight:900;letter-spacing:-.055em;margin-top:1.1vh}.headline em{font-style:normal;color:' + accent + '}.sub{font-size:3vw;line-height:1.35;font-weight:650;color:' + subInk + ';margin:1.5vh auto 0;max-width:82vw}' +
    '.visual{position:absolute;left:6vw;right:6vw;top:28vh;bottom:4.5vh;background:rgba(255,255,255,.93);border:1px solid rgba(14,15,12,.08);border-radius:4vw;padding:3.6vw;box-shadow:0 3vw 7vw rgba(22,51,0,.20);color:#0e0f0c;overflow:hidden}' +
    '.app-card{border-radius:2.4vw;padding:3.2vw}.app-dark{background:#163300;color:#fff}.eyebrow{font-size:2.3vw;font-weight:800;letter-spacing:.1em}.green{color:#9fe870}.metric{font-size:5.2vw;font-weight:900;letter-spacing:-.04em;margin-top:.5vh}.muted-on-dark,.muted-on-purple{font-size:2.6vw;font-weight:650;margin-top:.5vh}.muted-on-dark{color:#dce9d5}.muted-on-purple{color:#f3eaff}.progress{height:1.5vw;border-radius:999px;background:rgba(255,255,255,.15);overflow:hidden;display:flex;margin-top:2vh}.progress i{height:100%;display:block}.footnote-on-dark{font-size:2.1vw;color:#dce9d5;margin-top:1.2vh}' +
    '.rows{display:flex;flex-direction:column;gap:1.1vh;margin-top:1.6vh}.balance-row{display:flex;align-items:center;gap:2vw;padding:1.35vh 1vw;border-bottom:1px solid #e8ebe6}.balance-row i{width:.8vw;height:4.4vh;border-radius:999px}.balance-row b{font-size:3vw;flex:1}.balance-row span{font-size:2.8vw;font-weight:850;padding:.7vh 2vw;border-radius:999px}' +
    '.purple{background:linear-gradient(135deg,#63358f,#9b66c9);color:#fff}.topline,.setting{display:flex;justify-content:space-between;align-items:center}.topline b{font-size:2.7vw}.topline span{font-size:2vw;font-weight:800;background:rgba(255,255,255,.2);padding:.6vh 1.6vw;border-radius:999px}.purple-track{background:rgba(255,255,255,.2)}' +
    '.setting{margin-top:1.5vh;padding:1.7vh 1vw}.setting b{font-size:2.8vw}.setting small{display:block;color:#868685;font-size:2vw;margin-top:.3vh}.toggle{width:7vw;height:3.8vw;border-radius:999px;background:#9fe870;padding:.45vw;display:flex;justify-content:flex-end}.toggle i{width:2.9vw;height:2.9vw;border-radius:999px;background:#fff;box-shadow:0 .3vw .8vw rgba(0,0,0,.2)}' +
    '.setting-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2vw}.setting-grid div{background:#e8ebe6;border-radius:1.8vw;padding:1.8vw}.setting-grid small{display:block;color:#868685;font-size:1.9vw}.setting-grid b{font-size:2.9vw;display:block;margin-top:.3vh}.cycles{display:flex;flex-direction:column;gap:1vh;margin-top:1.5vh}.cycles>div{display:grid;grid-template-columns:.8vw 1fr 1.8fr 1fr;align-items:center;gap:1.4vw;padding:1.2vh 1.4vw;border-radius:1.5vw;background:#f7f7f5}.cycles>div.current{background:#f5eafe;outline:.3vw solid #c9a8e3}.cycles i{width:.7vw;height:4vh;background:#c9a8e3;border-radius:999px}.cycles .current i{background:#8a55be}.cycles b,.cycles strong{font-size:2.3vw}.cycles small{font-size:1.9vw;color:#868685}.cycles strong{text-align:right}' +
    '.feature-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.4vw}.feature-grid>div{background:#f4faee;border-radius:2.2vw;padding:2.6vw;min-height:12vh}.feature-grid span{display:block;color:#2f6b12;font-size:1.9vw;font-weight:900;letter-spacing:.14em}.feature-grid b{display:block;font-size:3.1vw;margin-top:.5vh}.feature-grid small{display:block;color:#454745;font-size:2.1vw;margin-top:.5vh}.brand-lockup{display:flex;align-items:center;justify-content:center;gap:2vw;margin-top:2.2vh}.brand-lockup img{width:7vw;height:7vw;border-radius:1.5vw}.brand-lockup b{display:block;font-size:3.2vw}.brand-lockup small{display:block;font-size:2vw;color:#454745}' +
    '</style></head><body><div class="marketing"><i class="orb one"></i><i class="orb two"></i><div class="copy"><div class="kicker">' + d.eyebrow + '</div><div class="headline">' + d.caption + '</div><div class="sub">' + d.sub + '</div></div><div class="visual">' + d.visual + '</div></div></body></html>';
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

  // iPhone 6.9" (1320x2868)
  for (const s of phoneShots) {
    const html = s.kind
      ? marketingSlideHTML({ W: 1320, H: 2868, kind: s.kind })
      : slideHTML({ W: 1320, H: 2868, caption: s.caption, sub: s.sub, screenHTML: SCREENS[s.screen](), ...PHONE });
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

  // Android phone (1080x2160, 2:1 이내)
  for (const s of phoneShots) {
    const html = s.kind
      ? marketingSlideHTML({ W: 1080, H: 2160, kind: s.kind })
      : slideHTML({ W: 1080, H: 2160, caption: s.caption, sub: s.sub, screenHTML: SCREENS[s.screen](), ...PHONE });
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
