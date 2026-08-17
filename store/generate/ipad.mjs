// 아이패드(App Store 13") 스토어 슬라이드 정의.
//
// 휴대전화 슬라이드가 실제 기기 캡처(shots.mjs)를 쓰듯, 아이패드 슬라이드는
// capture-web.mjs가 찍은 **실제 웹 데스크탑 뷰**를 쓴다. 예전의 가상 데이터 합성
// 화면(screens.mjs)은 더 이상 쓰지 않는다.
//
// 원본 캡처는 store/assets/web/*.png에 그대로 두고, 잘라내기는 여기서만 한다.
// 브랜드 토큰과 카피 블록은 shots.mjs와 공유해 두 덱이 한 세트로 읽히게 한다.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { B, TINTS } from "./shots.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, "..", "assets", "web");

/**
 * 캡처별 원본 크기와 잘라내기.
 *
 * `w`/`h`는 캡처 당시의 **CSS 뷰포트** 크기다(PNG 실측은 deviceScaleFactor 2배).
 * 여기서는 CSS 좌표로만 계산하고 배율은 브라우저가 알아서 처리한다.
 * `cropBottom`은 이 y좌표 아래를 슬라이드에 쓰지 않는다는 뜻이다.
 */
export const WEB_SHOTS = {
  calendar: { file: "calendar.png", w: 1440, h: 1080 },
  leaves: { file: "leaves.png", w: 1120, h: 1000 },
  grants: { file: "grants.png", w: 1120, h: 1000 },
  // 랜딩은 히어로 섹션에서 끊는다. 아래 "필요한 건 이미 다 있어요" 섹션이
  // 반쯤 걸치면 잘린 화면처럼 보인다.
  landing: { file: "landing.png", w: 1440, h: 1000, cropBottom: 677 },
};

for (const shot of Object.values(WEB_SHOTS)) {
  const buf = fs.readFileSync(path.join(ASSETS, shot.file));
  shot.uri = `data:image/png;base64,${buf.toString("base64")}`;
}

/**
 * 웹 캡처를 데스크탑 브라우저 창 목업 안에 넣는다.
 *
 * 그냥 사각형으로 붙이면 "앱 화면"인지 "웹 화면"인지 읽히지 않는다. 크롬 바를
 * 씌워야 아이패드 사용자가 "브라우저에서도 쓴다"로 이해한다.
 */
export function browserWindow(shotKey, targetW, { shadow = true, radiusScale = 0.016 } = {}) {
  const shot = WEB_SHOTS[shotKey];
  const visibleH = shot.cropBottom ?? shot.h;
  const k = targetW / shot.w;
  const bodyH = Math.round(visibleH * k);
  const barH = Math.round(targetW * 0.05);
  const radius = Math.round(targetW * radiusScale);
  const dot = Math.round(barH * 0.22);
  const dots = ["#ff5f57", "#febc2e", "#28c840"]
    .map(
      (c) =>
        `<span style="width:${dot}px;height:${dot}px;border-radius:999px;background:${c};display:inline-block"></span>`,
    )
    .join(`<span style="width:${Math.round(dot * 0.7)}px;display:inline-block"></span>`);

  return {
    w: Math.round(targetW),
    h: bodyH + barH,
    html: `<div style="width:${Math.round(targetW)}px;border-radius:${radius}px;overflow:hidden;background:#e9ece7;${
      shadow ? `box-shadow:0 ${Math.round(targetW * 0.035)}px ${Math.round(targetW * 0.085)}px rgba(22,51,0,.30)` : ""
    }">
      <div style="height:${barH}px;display:flex;align-items:center;padding:0 ${Math.round(barH * 0.55)}px;background:#dfe4db;border-bottom:1px solid rgba(14,15,12,.07)">
        ${dots}
        <div style="flex:1;display:flex;justify-content:center">
          <div style="background:#f6f8f4;border-radius:999px;padding:${Math.round(barH * 0.13)}px ${Math.round(barH * 0.8)}px;font-size:${Math.round(barH * 0.3)}px;font-weight:650;color:#6d7a66;letter-spacing:-.01em">leave.moveto.kr</div>
        </div>
        <div style="width:${dot * 3}px"></div>
      </div>
      <div style="width:${Math.round(targetW)}px;height:${bodyH}px;overflow:hidden;position:relative;background:#fff">
        <img src="${shot.uri}" style="position:absolute;top:0;left:0;width:${Math.round(shot.w * k)}px;height:${Math.round(shot.h * k)}px;display:block"/>
      </div>
    </div>`,
  };
}

/**
 * 캡처의 한 영역만 잘라 독립된 카드로 띄운다.
 *
 * 창을 통째로 두 개 겹치면 뒤쪽 창은 의미 없는 여백만 보인다. 대신 뒤쪽에서
 * **가장 할 말이 있는 카드**만 오려내 앞으로 띄운다.
 * `box`는 캡처 당시 CSS 좌표 기준이다.
 */
export function shotCard(shotKey, box, targetW, { radius = 0.04 } = {}) {
  const shot = WEB_SHOTS[shotKey];
  const k = targetW / box.w;
  const h = Math.round(box.h * k);
  const r = Math.round(targetW * radius);
  return {
    w: Math.round(targetW),
    h,
    html: `<div style="width:${Math.round(targetW)}px;height:${h}px;border-radius:${r}px;overflow:hidden;position:relative;background:#fff;box-shadow:0 ${Math.round(targetW * 0.04)}px ${Math.round(targetW * 0.09)}px rgba(22,51,0,.26)">
      <img src="${shot.uri}" style="position:absolute;left:${-Math.round(box.x * k)}px;top:${-Math.round(box.y * k)}px;width:${Math.round(shot.w * k)}px;height:${Math.round(shot.h * k)}px;display:block"/>
      <div style="position:absolute;inset:0;border-radius:${r}px;border:1px solid rgba(14,15,12,.08)"></div>
    </div>`,
  };
}

/**
 * 보유 휴가 화면의 요약 카드 영역(CSS 좌표).
 * "남은 휴가 116일 · 소멸 20일 · 만기가 빠른 적립분부터 자동으로 차감돼요"가 들어간다.
 * grants.png를 다시 찍으면 이 좌표도 다시 맞춰야 한다.
 */
const GRANTS_SUMMARY_BOX = { x: 202, y: 180, w: 716, h: 194 };

/** 슬라이드 상단 카피. shots.mjs의 copyBlock과 같은 위계·간격을 쓴다. */
function copyBlock({ W, H, slide, onDark = false }) {
  const ink = onDark ? "#ffffff" : B.ink;
  const kick = onDark ? B.primary : B.mid;
  const sub = onDark ? "#dcebd0" : B.inkDeep;
  const em = onDark ? B.primary : B.mid;
  return `
    <div style="width:100%;padding:0 ${Math.round(W * 0.075)}px;text-align:center;position:relative;z-index:3">
      <div style="font-size:${Math.round(W * 0.0205)}px;font-weight:800;letter-spacing:.16em;color:${kick}">${slide.kicker}</div>
      <div style="font-size:${Math.round(W * 0.058)}px;font-weight:900;line-height:1.07;letter-spacing:-.05em;color:${ink};margin-top:${Math.round(H * 0.009)}px">
        ${slide.caption.replaceAll("<em>", `<em style="font-style:normal;color:${em}">`)}
      </div>
      <div style="font-size:${Math.round(W * 0.0235)}px;font-weight:650;line-height:1.36;color:${sub};opacity:.85;margin-top:${Math.round(H * 0.011)}px">${slide.sub}</div>
    </div>`;
}

function orbs(W) {
  return `<div style="position:absolute;top:${-W * 0.24}px;right:${-W * 0.2}px;width:${W * 0.7}px;height:${W * 0.7}px;border-radius:999px;background:rgba(255,255,255,.32)"></div>
    <div style="position:absolute;left:${-W * 0.22}px;top:${W * 0.62}px;width:${W * 0.46}px;height:${W * 0.46}px;border-radius:999px;background:rgba(255,255,255,.2)"></div>`;
}

// ── 덱 정의 ────────────────────────────────────────────────────
// 인접 슬라이드끼리 레이아웃이 겹치지 않게 하고, 마지막 장은 다크로 끊는다.
export const TABLET_SLIDES = [
  {
    id: "01-calendar",
    layout: "single",
    shot: "calendar",
    tint: "mint",
    kicker: "함께 보는 휴가 달력",
    caption: "넓은 화면에서<br><em>우리 휴가 한눈에</em>",
    sub: "겹치는 날과 최대 출타 인원 초과를 계획 세우기 전에 먼저 확인해요",
  },
  {
    id: "02-leaves",
    layout: "window-card",
    shot: "leaves",
    shotCard: "grants",
    tint: "pale",
    kicker: "내 휴가",
    caption: "재원별 잔여도,<br>적립분 만기도 <em>자동으로</em>",
    sub: "연가·포상·위로·청원휴가를 한 화면에서, 만기가 빠른 적립분부터 차감",
  },
  {
    id: "03-landing",
    layout: "dark",
    shot: "landing",
    kicker: "LEAVE, SIMPLIFIED",
    caption: "휴가 계획은 같이,<br><em>잔여 관리는 나답게</em>",
    sub: "앱에서도 웹에서도 같은 계획을 그대로",
  },
];

/**
 * 아이패드 슬라이드 한 장을 HTML로 만든다.
 * head는 render.mjs의 docHead()(폰트·리셋), iconUri는 앱 아이콘 data URI.
 */
export function tabletSlideHTML({ W, H, slide, head, iconUri }) {
  const shell = (bg, body) =>
    `<!doctype html><html><head>${head}</head><body>
      <div style="width:${W}px;height:${H}px;background:${bg};position:relative;overflow:hidden">${body}</div>
    </body></html>`;

  if (slide.layout === "dark") {
    const dev = browserWindow(slide.shot, Math.round(W * 0.92));
    return shell(
      "linear-gradient(158deg,#0e0f0c 0%,#163300 55%,#2f6b12 100%)",
      `${orbs(W)}
      <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.072)}px">${copyBlock({ W, H, slide, onDark: true })}</div>
      <div style="position:absolute;left:50%;top:${Math.round(H * 0.27)}px;transform:translateX(-50%) rotate(-2deg);z-index:2">${dev.html}</div>
      <div style="position:absolute;left:0;right:0;bottom:${Math.round(H * 0.055)}px;display:flex;align-items:center;justify-content:center;gap:${Math.round(W * 0.018)}px;z-index:3">
        <img src="${iconUri}" style="width:${Math.round(W * 0.068)}px;height:${Math.round(W * 0.068)}px;border-radius:${Math.round(W * 0.015)}px"/>
        <div style="text-align:left">
          <div style="font-size:${Math.round(W * 0.03)}px;font-weight:900;color:#fff">리브</div>
          <div style="font-size:${Math.round(W * 0.019)}px;font-weight:600;color:#c9dcbb">휴가 계획을 가볍게</div>
        </div>
      </div>`,
    );
  }

  const bg = TINTS[slide.tint];

  if (slide.layout === "window-card") {
    // 창 하나 + 그 위에 겹친 요약 카드. 창을 두 개 겹치면 뒤쪽이 여백만 보이므로,
    // 뒤쪽 화면에서 할 말이 있는 카드만 오려 앞으로 띄운다.
    const dev = browserWindow(slide.shot, Math.round(W * 0.8));
    const card = shotCard(slide.shotCard, GRANTS_SUMMARY_BOX, Math.round(W * 0.66));
    return shell(
      bg,
      `${orbs(W)}
      <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.062)}px">${copyBlock({ W, H, slide })}</div>
      <div style="position:absolute;left:50%;top:${Math.round(H * 0.26)}px;transform:translateX(-50%) rotate(-1.6deg);z-index:2">${dev.html}</div>
      <div style="position:absolute;left:${Math.round(W * 0.055)}px;top:${Math.round(H * 0.755)}px;transform:rotate(-4deg);z-index:3">${card.html}</div>`,
    );
  }

  // single — 창 하나를 크게.
  const dev = browserWindow(slide.shot, Math.round(W * 0.95));
  return shell(
    bg,
    `${orbs(W)}
    <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.062)}px">${copyBlock({ W, H, slide })}</div>
    <div style="position:absolute;left:50%;top:${Math.round(H * 0.245)}px;transform:translateX(-50%) rotate(-1.6deg);z-index:2">${dev.html}</div>`,
  );
}
