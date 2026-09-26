// 아이패드(App Store 13") 스토어 슬라이드 정의.
//
// 휴대전화 슬라이드가 실제 기기 캡처(shots.mjs)를 쓰듯, 아이패드 슬라이드는
// iPad 시뮬레이터에서 캡처한 **실제 네이티브 앱 화면**을 쓴다.
// 예전의 웹 데스크탑 뷰 합성(store/assets/web)은 더 이상 쓰지 않는다.
//
// 원본 캡처는 store/assets/screens/ipad-*.png에 그대로 두고, 잘라내기는 여기서만 한다.
// 브랜드 토큰과 카피 블록은 shots.mjs와 공유해 두 덱이 한 세트로 읽히게 한다.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { B, TINTS } from "./shots.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, "..", "assets", "screens");

/** iPad Pro 13" 시뮬레이터 실제 디스플레이 크기. */
export const IPAD_SRC = { w: 2064, h: 2752 };

/** 캡처별 원본과 잘라내기(원본 픽셀 좌표). */
export const IPAD_SHOTS = {
  calendar: { file: "ipad-01-calendar.png", cropBottom: 2752 },
  myleave: { file: "ipad-02-myleave.png", cropBottom: 2752 },
  notify: { file: "ipad-03-notify.png", cropBottom: 2752 },
  profile: { file: "ipad-04-profile.png", cropBottom: 2752 },
};

for (const shot of Object.values(IPAD_SHOTS)) {
  const buf = fs.readFileSync(path.join(ASSETS, shot.file));
  shot.uri = `data:image/png;base64,${buf.toString("base64")}`;
}

/**
 * iPad 화면을 다크 베젤 기기 목업 안에 넣는다.
 * shots.mjs의 framedDevice와 같은 생김새, 다른 소스 크기만 분리했다.
 */
export function ipadDevice(shotKey, targetW, { shadow = true } = {}) {
  const shot = IPAD_SHOTS[shotKey];
  const k = targetW / IPAD_SRC.w;
  const bodyH = Math.round((shot.cropBottom ?? IPAD_SRC.h) * k);
  const bezel = Math.max(16, Math.round(targetW * 0.035));
  const radius = Math.round(targetW * 0.055);
  const outerR = radius + bezel;
  return {
    w: Math.round(targetW + bezel * 2),
    h: bodyH + bezel * 2,
    html: `<div style="width:${Math.round(targetW + bezel * 2)}px;height:${bodyH + bezel * 2}px;background:#0e0f0c;border-radius:${outerR}px;padding:${bezel}px;${
      shadow
        ? `box-shadow:0 ${Math.round(targetW * 0.05)}px ${Math.round(targetW * 0.11)}px rgba(22,51,0,.30)`
        : ""
    }">
      <div style="width:${Math.round(targetW)}px;height:${bodyH}px;border-radius:${radius}px;overflow:hidden;position:relative;background:#fff">
        <img src="${shot.uri}" style="display:block;width:${Math.round(targetW)}px;height:${bodyH}px"/>
      </div>
    </div>`,
  };
}

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
    sub: "두 달과 오늘의 출타 요약을 한 화면에서 확인해요",
  },
  {
    id: "02-myleave",
    layout: "single",
    shot: "myleave",
    tint: "pale",
    kicker: "내 휴가",
    caption: "재원별 잔여도<br><em>큰 화면에서 한눈에</em>",
    sub: "다음 휴가와 남은 휴가, 재원별 사용량을 나란히",
  },
  {
    id: "03-notify",
    layout: "single",
    shot: "notify",
    tint: "lime",
    kicker: "알림",
    caption: "친구의 새 소식도<br><em>바로 확인</em>",
    sub: "친구 요청과 친구의 새 휴가를 알림에서 바로",
  },
  {
    id: "04-more",
    layout: "dark",
    shot: "profile",
    kicker: "LEAVE, SIMPLIFIED",
    caption: "휴가 계획은 같이,<br><em>잔여 관리는 나답게</em>",
    sub: "아이폰·아이패드·애플워치, 같은 계획을 그대로",
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
    const dev = ipadDevice(slide.shot, Math.round(W * 0.62));
    return shell(
      "linear-gradient(158deg,#0e0f0c 0%,#163300 55%,#2f6b12 100%)",
      `${orbs(W)}
      <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.062)}px">${copyBlock({ W, H, slide, onDark: true })}</div>
      <div style="position:absolute;left:50%;top:${Math.round(H * 0.3)}px;transform:translateX(-50%) rotate(-2deg);z-index:2">${dev.html}</div>
      <div style="position:absolute;left:0;right:0;bottom:${Math.round(H * 0.045)}px;display:flex;align-items:center;justify-content:center;gap:${Math.round(W * 0.018)}px;z-index:3">
        <img src="${iconUri}" style="width:${Math.round(W * 0.068)}px;height:${Math.round(W * 0.068)}px;border-radius:${Math.round(W * 0.015)}px"/>
        <div style="text-align:left">
          <div style="font-size:${Math.round(W * 0.03)}px;font-weight:900;color:#fff">리브</div>
          <div style="font-size:${Math.round(W * 0.019)}px;font-weight:600;color:#c9dcbb">휴가 계획을 가볍게</div>
        </div>
      </div>`,
    );
  }

  const bg = TINTS[slide.tint];

  // single — 기기 하나를 크게. 화면이 캔버스 아래로 살짝 흘러나간다.
  const dev = ipadDevice(slide.shot, Math.round(W * 0.68));
  return shell(
    bg,
    `${orbs(W)}
    <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.055)}px">${copyBlock({ W, H, slide })}</div>
    <div style="position:absolute;left:50%;top:${Math.round(H * 0.27)}px;transform:translateX(-50%) rotate(-1.6deg);z-index:2">${dev.html}</div>`,
  );
}
