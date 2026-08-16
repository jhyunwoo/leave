// 실제 기기에서 캡처한 앱 스크린샷을 스토어 슬라이드로 합성하기 위한 정의.
//
// 원본은 store/assets/screens/*.jpg (922x1999, iPhone 세로)에 그대로 보관하고,
// 민감 정보 가림(redact)과 하단 잘라내기(cropBottom)는 원본을 건드리지 않고
// 합성 단계에서만 적용한다. 좌표는 모두 원본 픽셀 기준이다.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, "..", "assets", "screens");

// 원본 캡처 크기
export const SRC = { w: 922, h: 1999 };

// 브랜드 토큰 (apps/native theme.ts / DESIGN.md 기준)
export const B = {
  primary: "#9fe870",
  ink: "#0e0f0c",
  inkDeep: "#163300",
  mid: "#2f6b12",
  body: "#454745",
  pale: "#f4faee",
  paleSoft: "#e2f6d5",
};

function dataURI(file) {
  const buf = fs.readFileSync(path.join(ASSETS, file));
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

// 캡처별 처리 규칙
// - cropBottom: 이 y좌표 아래는 슬라이드에 쓰지 않는다.
//   달력/프로필은 탭바 뒤로 스크롤 콘텐츠가 비쳐 보이는 렌더 잔상이 있어 잘라낸다.
//   프로필 하단 잔상에는 실제 부대명이 흐리게 남아 있어 반드시 잘라야 한다.
// - redact: 흰 박스로 덮을 영역(원본 픽셀 좌표). 모서리를 둥글리면 곡선 안쪽이 덮이지 않아
//   글자 끄트머리가 남으므로 직각으로 그린다. REDACT_DEBUG=1 로 렌더하면 빨간 박스로 보여
//   좌표를 눈으로 검증할 수 있다.
export const SHOTS = {
  calendar: {
    file: "01-calendar.jpg",
    cropBottom: 1795, // 탭바 + "2026년 8월" 스크롤 잔상 제거
    redact: [],
  },
  myleave: {
    file: "02-myleave.jpg",
    cropBottom: 1952, // 탭바 아래 "두 번째 휴가" 잘림 제거
    redact: [],
  },
  balance: {
    file: "03-balance.jpg",
    cropBottom: 1955, // 반쯤 잘린 "0일" 제거
    redact: [],
  },
  notify: {
    file: "04-notify.jpg",
    // 알림 화면은 카드 아래가 거의 비어 있어, 헤더와 알림 카드만 잘라 카드 목업으로 쓴다.
    cropTop: 268,
    cropBottom: 950,
    // 알림 본문 1행 전체(실제 부대명 + "에서 4월 24")와 2행 앞머리("일 외 2일에")를 덮어
    // 남은 문장이 "최대 출타 인원을 초과했습니다."로 자연스럽게 읽히게 한다.
    redact: [
      { x: 80, y: 596, w: 828, h: 56 },
      { x: 80, y: 651, w: 172, h: 60 },
    ],
  },
  profile: {
    file: "05-profile.jpg",
    cropBottom: 1795, // 탭바 뒤에 비치는 실제 부대명 잔상 제거
    // 프로필의 실제 이메일 주소(원본 x 282–645, y 563–600). 이름 "김공군"은 y 552에서 끝난다.
    redact: [{ x: 268, y: 555, w: 394, h: 53 }],
  },
};

for (const key of Object.keys(SHOTS)) SHOTS[key].uri = dataURI(SHOTS[key].file);

// 스크린샷 한 장을 화면 폭 screenW(px)로 그린다. 반환 높이는 crop 기준.
// radius는 화면 자체의 모서리 반경.
export function screenBlock(shotKey, screenW, radius) {
  const shot = SHOTS[shotKey];
  const k = screenW / SRC.w;
  const cropTop = shot.cropTop || 0;
  const screenH = Math.round((shot.cropBottom - cropTop) * k);
  const boxes = shot.redact
    .map(
      (r) =>
        `<div style="position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${process.env.REDACT_DEBUG ? "red" : "#fff"}"></div>`,
    )
    .join("");
  const inner = `<div style="position:absolute;top:${-cropTop * k}px;left:0;width:${SRC.w}px;height:${SRC.h}px;transform:scale(${k});transform-origin:top left">
      <img src="${shot.uri}" style="display:block;width:${SRC.w}px;height:${SRC.h}px"/>${boxes}
    </div>`;
  return {
    w: Math.round(screenW),
    h: screenH,
    html: `<div style="width:${Math.round(screenW)}px;height:${screenH}px;border-radius:${radius}px;overflow:hidden;position:relative;background:#fff">${inner}</div>`,
  };
}

// 베젤이 있는 기기 목업
export function framedDevice(shotKey, screenW, { bezel, shadow = true }) {
  const radius = Math.round(screenW * 0.085);
  const s = screenBlock(shotKey, screenW, radius);
  const outerR = radius + bezel;
  return {
    w: s.w + bezel * 2,
    h: s.h + bezel * 2,
    html: `<div style="width:${s.w + bezel * 2}px;height:${s.h + bezel * 2}px;background:#0e0f0c;border-radius:${outerR}px;padding:${bezel}px;${shadow ? `box-shadow:0 ${Math.round(screenW * 0.06)}px ${Math.round(screenW * 0.13)}px rgba(22,51,0,.32)` : ""}">${s.html}</div>`,
  };
}

// 베젤 없이 화면만 크게
export function bareDevice(shotKey, screenW, { shadow = true } = {}) {
  const radius = Math.round(screenW * 0.075);
  const s = screenBlock(shotKey, screenW, radius);
  return {
    w: s.w,
    h: s.h,
    html: `<div style="width:${s.w}px;height:${s.h}px;border-radius:${radius}px;position:relative;${shadow ? `box-shadow:0 ${Math.round(screenW * 0.05)}px ${Math.round(screenW * 0.12)}px rgba(22,51,0,.26)` : ""}">${s.html}<div style="position:absolute;inset:0;border-radius:${radius}px;border:1px solid rgba(14,15,12,.10);pointer-events:none"></div></div>`,
  };
}

// ── 덱 정의 ────────────────────────────────────────────────────
// 화면마다 카피 한 덩어리, 목업 처리는 슬라이드마다 다르게 섞는다.
export const SLIDES = [
  {
    id: "01-calendar",
    shot: "calendar",
    layout: "hero",
    kicker: "함께 보는 휴가 달력",
    caption: "우리 휴가,<br><em>한눈에</em>",
    sub: "겹치는 날을 계획 세우기 전에 먼저 확인해요",
    tint: "mint",
  },
  {
    id: "02-balance",
    shot: "myleave",
    layout: "framed",
    kicker: "내 휴가",
    caption: "남은 휴가,<br><em>재원별로</em>",
    sub: "연가·포상·위로·청원휴가를 한 화면에서",
    tint: "pale",
  },
  {
    id: "03-accrual",
    shot: "balance",
    layout: "bleed",
    kicker: "보유 휴가",
    caption: "적립분과 만기까지<br><em>자동 계산</em>",
    sub: "만기가 빠른 적립분부터 알아서 차감돼요",
    tint: "lime",
  },
  {
    id: "04-notify",
    shot: "notify",
    layout: "card",
    kicker: "출타 인원 알림",
    caption: "인원이 차면<br><em>바로 알림</em>",
    sub: "최대 출타 인원을 넘긴 날짜만 골라서 알려줘요",
    tint: "mint",
  },
  {
    id: "05-profile",
    shot: "profile",
    layout: "tilt",
    kicker: "내 프로필",
    caption: "전역까지<br><em>며칠 남았는지</em>",
    sub: "복무율과 다음 진급일을 프로필에서 바로",
    tint: "pale",
  },
  {
    id: "06-more",
    layout: "wall",
    kicker: "LEAVE, SIMPLIFIED",
    caption: "휴가 계획은 같이,<br><em>잔여 관리는 나답게</em>",
    sub: "함께 세우는 계획과 내 휴가 관리를 리브 하나로",
    features: [
      ["01", "공유 달력", "함께 보는 휴가 계획"],
      ["02", "혼잡 신호", "겹치는 날 미리 확인"],
      ["03", "재원별 잔여", "연가부터 청원휴가까지"],
      ["04", "적립분 관리", "만기까지 자동 차감"],
      ["05", "출타 인원 알림", "넘친 날짜만 선택해서"],
      ["06", "정기외박 주기", "주기별 사용량 자동 계산"],
    ],
  },
];

export const TINTS = {
  mint: "linear-gradient(168deg,#f7fcf2 0%,#dcf3c6 52%,#9fe870 100%)",
  pale: "linear-gradient(168deg,#ffffff 0%,#eef9e4 55%,#c8eca0 100%)",
  lime: "linear-gradient(168deg,#f2fae9 0%,#cfeeae 50%,#a8e97c 100%)",
};
