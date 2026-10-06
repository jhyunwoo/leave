/**
 * 온보딩 사용법 투어 — 기능마다 한 장씩 도는 모션 그래픽의 장면 데이터.
 *
 * 사용처: 웹 `pages/onboarding/TourStage.tsx`·`HowtoStep.tsx`,
 *         네이티브 `screens/onboarding/tour-stage.tsx`·`howto-step.tsx`.
 *
 * 예전 사용법 단계는 글 카드 다섯 장이었다. 처음 들어온 사람에게 "달력에서 날짜를
 * 누르면 시트가 열린다"를 글로 읽히면 실제 화면에서 그 자리를 다시 찾아야 한다.
 * 그래서 앱 화면을 줄인 그림이 스스로 움직이며 그 동작을 해 보이게 바꿨다.
 *
 * 그림은 히어로(onboarding.ts)와 같은 원칙을 따른다 — **좌표·색·시간표를 여기
 * 한 벌만 두고** 두 앱은 받은 그대로 그린다. 장면은 평평한 노드 목록이다.
 * 노드는 사각형(box)·글자(text)·선 아이콘(icon) 셋뿐이고, 움직임은 노드마다
 * 키프레임(`keys`)으로 적는다. 움직이는 속성도 불투명도·이동·배율·회전으로만
 * 한정했다. 두 플랫폼 모두 레이아웃을 다시 계산하지 않고 합성만으로 그릴 수 있는
 * 속성이라 저사양 기기에서도 끊기지 않고, 웹(rAF)과 네이티브(Reanimated)가 같은
 * 함수(`sampleTourPose`)로 같은 순간의 같은 자세를 얻는다.
 *
 * 장면 속 날짜·이름·숫자는 예시다. 다만 서로 맞물리게 골랐다(2026년 10월 달력의
 * 실제 요일, 육군 18개월 복무 기준의 복무율·진급일). 그림이 틀린 달력을 보여주면
 * 군 생활을 하는 사람에게는 바로 눈에 걸린다.
 *
 * 문구 규칙은 `ONBOARDING_HOWTO`와 같다 — 저장소가 실제로 하는 일만 적는다.
 */

/** 장면 좌표계. 그리는 쪽이 폭에 맞춰 통째로 확대한다. */
export const TOUR_CANVAS = { width: 320, height: 260 } as const;

/**
 * 장면이 쓰는 색 이름. 값은 `TOUR_PALETTE`가 스킴별로 정한다.
 *
 * 웹 global.css·네이티브 theme.ts의 토큰과 휴가 재원 팔레트를 그대로 옮겼다 —
 * 그림 속 연가 칩이 실제 달력의 연가 칩과 같은 색이어야 "아, 그거" 하고 이어진다.
 * `night*`는 복무율 장면의 어두운 카드라 두 스킴에서 같은 값이다.
 */
export type TourTone =
  | "card"
  | "soft"
  | "line"
  | "selected"
  | "ink"
  | "body"
  | "mute"
  | "primary"
  | "onPrimary"
  | "pale"
  | "brand"
  | "positive"
  | "negative"
  | "annual"
  | "annualInk"
  | "award"
  | "awardInk"
  | "overnight"
  | "overnightInk"
  | "outing"
  | "outingInk"
  | "friend"
  | "friendInk"
  | "friendBar"
  | "touch"
  | "toast"
  | "onToast"
  | "toastMute"
  | "nightCard"
  | "nightLine"
  | "nightText"
  | "nightMute";

export type TourScheme = "light" | "dark";

export const TOUR_PALETTE: Record<TourScheme, Record<TourTone, string>> = {
  light: {
    card: "#ffffff",
    soft: "#f2f4f0",
    line: "#d7dbd4",
    selected: "rgba(14, 15, 12, 0.1)",
    ink: "#0e0f0c",
    body: "#454745",
    mute: "#666864",
    primary: "#9fe870",
    onPrimary: "#0e0f0c",
    pale: "#e2f6d5",
    brand: "#347a1f",
    positive: "#2ead4b",
    negative: "#d03238",
    annual: "#d8f3c4",
    annualInk: "#1f5e10",
    award: "#ffe8c7",
    awardInk: "#8a4b00",
    overnight: "#d8e6ff",
    overnightInk: "#12439c",
    outing: "#e4e7e2",
    outingInk: "#454745",
    friend: "#e6ddff",
    friendInk: "#4c2c9c",
    friendBar: "#7a5af0",
    touch: "rgba(14, 15, 12, 0.3)",
    toast: "#0e0f0c",
    onToast: "#ffffff",
    toastMute: "#a9aca6",
    nightCard: "#1a1d17",
    nightLine: "#2d3329",
    nightText: "#f2f4f0",
    nightMute: "#9a9e96",
  },
  dark: {
    card: "#2c2c2e",
    soft: "#3a3a3c",
    line: "#4a4a4d",
    selected: "rgba(242, 244, 240, 0.16)",
    ink: "#f2f4f0",
    body: "#b9bdb6",
    mute: "#8e918c",
    primary: "#70c945",
    onPrimary: "#071005",
    pale: "#213d18",
    brand: "#79d553",
    positive: "#45d265",
    negative: "#ff6b6f",
    annual: "#1e3311",
    annualInk: "#b7e79a",
    award: "#40270a",
    awardInk: "#ffcf94",
    overnight: "#16294d",
    overnightInk: "#a9c7ff",
    outing: "#2c2e2b",
    outingInk: "#c9ccc6",
    friend: "#2b2350",
    friendInk: "#cdbcff",
    friendBar: "#9d86ff",
    touch: "rgba(242, 244, 240, 0.42)",
    toast: "#48484a",
    onToast: "#ffffff",
    toastMute: "#c2c5bf",
    nightCard: "#1a1d17",
    nightLine: "#2d3329",
    nightText: "#f2f4f0",
    nightMute: "#9a9e96",
  },
};

/** 장면 바탕. 기능마다 다른 색을 깔아 장면이 바뀌었다는 게 먼저 읽히게 한다. */
export type TourBackdrop = "green" | "amber" | "blue" | "violet" | "night";

export const TOUR_BACKDROP: Record<TourScheme, Record<TourBackdrop, string>> = {
  light: {
    green: "#e2f6d5",
    amber: "#fff0d9",
    blue: "#dde8ff",
    violet: "#ebe4ff",
    night: "#0e0f0c",
  },
  dark: {
    green: "#1b3114",
    amber: "#33240d",
    blue: "#14233f",
    violet: "#241d42",
    night: "#0b0c0a",
  },
};

/** 24×24 좌표계의 선 아이콘. 굵기 2.2, 끝은 둥글게 그린다. */
export const TOUR_ICONS = {
  bell: [
    "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z",
    "M10 21a2.2 2.2 0 0 0 4 0",
  ],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  search: ["M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14z", "M16.2 16.2L20 20"],
} as const;

export type TourIconName = keyof typeof TOUR_ICONS;

/** 한 순간의 자세. 이동(x, y)은 노드 자리에서 얼마나 떨어졌는지다. */
export interface TourPose {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  /** 가로 배율. `scale`과 곱해진다 — 막대가 차오르는 데 쓴다. */
  sx: number;
  /** 세로 배율. `scale`과 곱해진다. */
  sy: number;
  /** 도(degree). */
  rotate: number;
}

const REST: TourPose = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  sx: 1,
  sy: 1,
  rotate: 0,
};

const POSE_KEYS = Object.keys(REST) as (keyof TourPose)[];

/**
 * 구간 곡선. 키프레임의 `ease`는 **그 키프레임에 도착하는** 구간에 걸린다.
 *  - out    : 빠르게 출발해 부드럽게 멈춘다(등장·이동의 기본)
 *  - inOut  : 손가락처럼 출발과 도착이 모두 부드러운 이동
 *  - back   : 살짝 지나쳤다 돌아온다(튀어나오는 칩)
 *  - linear : 일정한 속도(계속 차오르는 막대)
 */
export type TourEase = "out" | "inOut" | "back" | "linear";

export interface TourKey extends Partial<TourPose> {
  /** 장면 한 바퀴를 0~1로 본 시점. */
  at: number;
  ease?: TourEase;
}

/** 배율·회전의 기준점. */
export type TourOrigin = "center" | "left" | "right" | "top" | "bottom";

interface TourNodeBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  keys?: readonly TourKey[];
  origin?: TourOrigin;
}

export interface TourBoxNode extends TourNodeBase {
  kind: "box";
  fill?: TourTone;
  /** 1.5px 테두리. */
  stroke?: TourTone;
  radius?: number;
  /** 떠 있는 시트·토스트처럼 아래 내용과 떨어져 보여야 하는 면. */
  shadow?: boolean;
}

export type TourWeight = 500 | 600 | 700 | 800 | 900;

export interface TourTextNode extends TourNodeBase {
  kind: "text";
  text: string;
  size: number;
  weight?: TourWeight;
  color: TourTone;
  align?: "left" | "center" | "right";
}

export interface TourIconNode extends TourNodeBase {
  kind: "icon";
  icon: TourIconName;
  color: TourTone;
}

export type TourNode = TourBoxNode | TourTextNode | TourIconNode;

function ease(kind: TourEase, t: number): number {
  switch (kind) {
    case "linear":
      return t;
    case "inOut":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "back": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    case "out":
      return 1 - Math.pow(1 - t, 3);
  }
}

/**
 * 시점 t(0~1)의 자세.
 *
 * 속성마다 따로 본다 — 어떤 키프레임이 opacity만 적었다면 그 키프레임은 x·y에
 * 아무 영향이 없다. 그래서 "여기서 멈칫했다가 저기로 간다"를 속성별로 겹쳐 적을
 * 수 있다. 첫 키프레임 앞은 첫 값을, 마지막 뒤는 마지막 값을 유지한다.
 */
export function sampleTourPose(
  keys: readonly TourKey[] | undefined,
  t: number,
): TourPose {
  if (!keys || keys.length === 0) return REST;
  const pose = { ...REST };
  for (const prop of POSE_KEYS) {
    let prev: TourKey | undefined;
    let next: TourKey | undefined;
    for (const key of keys) {
      if (key[prop] === undefined) continue;
      if (key.at <= t) prev = key;
      else {
        next = key;
        break;
      }
    }
    const from = prev?.[prop];
    const to = next?.[prop];
    if (from === undefined && to === undefined) continue;
    if (from === undefined) pose[prop] = to as number;
    else if (to === undefined || !prev || !next) pose[prop] = from;
    else {
      const span = next.at - prev.at;
      const local = span <= 0 ? 1 : (t - prev.at) / span;
      pose[prop] = from + (to - from) * ease(next.ease ?? "out", local);
    }
  }
  return pose;
}

/** 키프레임 중 실제로 값이 바뀌는 속성. 네이티브가 움직일 속성만 골라 굴린다. */
export function tourAnimatedProps(
  keys: readonly TourKey[] | undefined,
): (keyof TourPose)[] {
  if (!keys) return [];
  return POSE_KEYS.filter((prop) => {
    const values = keys
      .map((key) => key[prop])
      .filter((value) => value !== undefined);
    return values.some((value) => value !== REST[prop]);
  });
}

/** 모든 장면이 같은 박자로 사라졌다가 처음으로 돌아간다. */
const EXIT_FROM = 0.93;
const EXIT_TO = 0.985;

type PoseDelta = Partial<Omit<TourPose, "opacity">>;

function restOf(delta: PoseDelta): PoseDelta {
  const rest: PoseDelta = {};
  for (const prop of Object.keys(delta) as (keyof PoseDelta)[])
    rest[prop] = REST[prop];
  return rest;
}

interface Appear {
  /** 등장 시작 시점. */
  at: number;
  /** 어디서부터 들어오는가. 기본은 아래에서 10만큼 떠오른다. */
  from?: PoseDelta;
  dur?: number;
  ease?: TourEase;
  /** 장면 중간에 퇴장하는 시점. 없으면 마지막에 함께 사라진다. */
  leave?: number;
  /** 퇴장할 때 어디로 가는가. */
  to?: PoseDelta;
  leaveDur?: number;
}

/** 나타났다가(필요하면 중간에 퇴장하고) 마지막에 사라지는 가장 흔한 생애. */
function life(spec: Appear): TourKey[] {
  const from = spec.from ?? { y: 10 };
  const dur = spec.dur ?? 0.06;
  const arrive = spec.at + dur;
  const keys: TourKey[] = [
    { at: 0, opacity: 0, ...from },
    { at: spec.at, opacity: 0, ...from },
    { at: arrive, opacity: 1, ...restOf(from), ease: spec.ease ?? "out" },
  ];
  if (spec.leave !== undefined) {
    const to = spec.to ?? {};
    keys.push(
      { at: spec.leave, opacity: 1, ...restOf(to) },
      {
        at: spec.leave + (spec.leaveDur ?? 0.045),
        opacity: 0,
        ...to,
        ease: "inOut",
      },
    );
  } else {
    keys.push({ at: EXIT_FROM, opacity: 1 }, { at: EXIT_TO, opacity: 0 });
  }
  return keys;
}

/** 이미 떠 있는 것을 t에 한 번 눌렀다 뗀다(손가락·버튼). */
function press(at: number, depth = 0.8): TourKey[] {
  return [
    { at, scale: 1 },
    { at: at + 0.018, scale: depth, ease: "out" },
    { at: at + 0.045, scale: 1, ease: "back" },
  ];
}

function merge(...parts: TourKey[][]): TourKey[] {
  return parts.flat().sort((a, b) => a.at - b.at);
}

/** 터치 지점에서 퍼지는 물결. */
function ripple(id: string, cx: number, cy: number, at: number): TourNode {
  return {
    kind: "box",
    id,
    x: cx - 18,
    y: cy - 18,
    w: 36,
    h: 36,
    radius: 18,
    fill: "primary",
    keys: [
      { at: 0, opacity: 0, scale: 0.3 },
      { at, opacity: 0, scale: 0.3 },
      { at: at + 0.006, opacity: 0.75, scale: 0.35, ease: "linear" },
      { at: at + 0.09, opacity: 0, scale: 1.6, ease: "out" },
    ],
  };
}

interface FingerStop {
  /** 이 지점에 도착하는 시점. */
  at: number;
  cx: number;
  cy: number;
  /** 도착한 뒤 누르는가. */
  tap?: boolean;
}

/**
 * 손가락 하나와 탭마다 퍼지는 물결.
 *
 * 노드 자리는 첫 지점이고, 나머지 지점은 거기서의 이동량으로 적는다. 지점 사이는
 * `inOut`으로 옮겨 실제 손이 출발·도착하는 느낌을 낸다.
 */
function finger(
  id: string,
  stops: readonly FingerStop[],
  leaveAt: number,
): TourNode[] {
  const first = stops[0];
  if (!first) return [];
  const size = 26;
  const keys: TourKey[] = [
    { at: 0, opacity: 0, x: 70, y: 80 },
    { at: Math.max(first.at - 0.07, 0), opacity: 0, x: 70, y: 80 },
    { at: first.at, opacity: 1, x: 0, y: 0, ease: "inOut" },
  ];
  const ripples: TourNode[] = [];
  stops.forEach((stop, index) => {
    const dx = stop.cx - first.cx;
    const dy = stop.cy - first.cy;
    if (index > 0) {
      const previous = stops[index - 1] as FingerStop;
      // 앞 지점에서 누른 뒤 잠깐 머물렀다가 출발한다.
      const depart = Math.max(previous.at + 0.06, stop.at - 0.07);
      keys.push(
        {
          at: depart,
          x: previous.cx - first.cx,
          y: previous.cy - first.cy,
        },
        { at: stop.at, x: dx, y: dy, ease: "inOut" },
      );
    }
    if (stop.tap) {
      keys.push(...press(stop.at + 0.012, 0.74));
      ripples.push(
        ripple(`${id}-ripple-${index}`, stop.cx, stop.cy, stop.at + 0.03),
      );
    }
  });
  keys.push({ at: leaveAt, opacity: 1 }, { at: leaveAt + 0.05, opacity: 0 });
  return [
    ...ripples,
    {
      kind: "box",
      id,
      x: first.cx - size / 2,
      y: first.cy - size / 2,
      w: size,
      h: size,
      radius: size / 2,
      fill: "touch",
      stroke: "card",
      keys: merge(keys),
    },
  ];
}

type BoxOpts = Omit<TourBoxNode, "kind" | "id" | "x" | "y" | "w" | "h">;
type TextOpts = Partial<
  Omit<TourTextNode, "kind" | "id" | "x" | "y" | "w" | "h" | "text">
>;

function box(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: BoxOpts = {},
): TourBoxNode {
  return { kind: "box", id, x, y, w, h, ...opts };
}

function text(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  opts: TextOpts = {},
): TourTextNode {
  return {
    kind: "text",
    id,
    x,
    y,
    w,
    h,
    text: value,
    size: opts.size ?? 12,
    weight: opts.weight ?? 600,
    color: opts.color ?? "ink",
    align: opts.align ?? "left",
    ...(opts.keys ? { keys: opts.keys } : {}),
    ...(opts.origin ? { origin: opts.origin } : {}),
  };
}

function icon(
  id: string,
  x: number,
  y: number,
  size: number,
  name: TourIconName,
  color: TourTone,
  keys?: readonly TourKey[],
): TourIconNode {
  return {
    kind: "icon",
    id,
    x,
    y,
    w: size,
    h: size,
    icon: name,
    color,
    ...(keys ? { keys } : {}),
  };
}

/** 두 값이 자리를 바꾸는 숫자(위로 밀려 나가고 아래에서 올라온다). */
function swapKeys(
  at: number,
  appearAt: number,
): { before: TourKey[]; after: TourKey[] } {
  return {
    before: [
      ...life({ at: appearAt, leave: at, to: { y: -10 }, leaveDur: 0.04 }),
    ],
    after: [
      { at: 0, opacity: 0, y: 10 },
      { at, opacity: 0, y: 10 },
      { at: at + 0.05, opacity: 1, y: 0, ease: "out" },
      { at: EXIT_FROM, opacity: 1 },
      { at: EXIT_TO, opacity: 0 },
    ],
  };
}

/* 휴가 등록 장면 */

const CAL = {
  colX: (col: number) => 27 + col * 38,
  rowY: (row: number) => 74 + row * 36,
};

function leaveScene(): TourNode[] {
  const cardIn = life({ at: 0, from: { y: 14 }, dur: 0.07 });
  const nodes: TourNode[] = [
    box("card", 16, 16, 288, 228, { fill: "card", radius: 18, keys: cardIn }),
    text("month", 32, 28, 120, 22, "2026년 10월", {
      size: 15,
      weight: 800,
      keys: cardIn,
    }),
    text("mode", 188, 30, 100, 18, "내 달력", {
      size: 10.5,
      weight: 700,
      color: "mute",
      align: "right",
      keys: cardIn,
    }),
  ];
  "일월화수목금토".split("").forEach((day, col) => {
    nodes.push(
      text(`wd-${col}`, CAL.colX(col), 56, 38, 12, day, {
        size: 9.5,
        weight: 700,
        color: col === 0 ? "negative" : "mute",
        align: "center",
        keys: cardIn,
      }),
    );
  });

  // 2026년 10월 4일은 일요일이다. 10월 9일(금)은 한글날이라 빨갛게 그린다.
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 7; col++) {
      const date = 4 + row * 7 + col;
      nodes.push(
        text(`d-${date}`, CAL.colX(col), CAL.rowY(row), 38, 16, String(date), {
          size: 12,
          weight: 600,
          color: col === 0 || date === 9 ? "negative" : "body",
          align: "center",
          keys: cardIn,
        }),
      );
    }

  // 고른 날(10월 13일)의 반투명 원. 숫자 아래에 깔려야 해서 손가락보다 먼저 둔다.
  nodes.splice(
    nodes.findIndex((node) => node.id === "d-4"),
    0,
    box("pick", CAL.colX(2) + 5, CAL.rowY(1) - 3, 28, 22, {
      fill: "selected",
      radius: 11,
      keys: life({
        at: 0.17,
        from: { scale: 0.5 },
        dur: 0.05,
        ease: "back",
        leave: 0.62,
      }),
    }),
  );

  // 저장 뒤 달력에 남는 칩 — 한 휴가 안에서 연가 2일 + 정기외박 2일.
  const chipY = CAL.rowY(1) + 21;
  nodes.push(
    box("chip-annual", 106, chipY, 72, 10, {
      fill: "annual",
      radius: 4,
      origin: "left",
      keys: life({ at: 0.63, from: { sx: 0 }, dur: 0.06 }),
    }),
    box("chip-overnight", 180, chipY, 72, 10, {
      fill: "overnight",
      radius: 4,
      origin: "left",
      keys: life({ at: 0.67, from: { sx: 0 }, dur: 0.06 }),
    }),
    text("chip-annual-t", 106, chipY, 72, 10, "연가", {
      size: 7.5,
      weight: 800,
      color: "annualInk",
      align: "center",
      keys: life({ at: 0.68, from: {}, dur: 0.04 }),
    }),
    text("chip-overnight-t", 180, chipY, 72, 10, "정기외박", {
      size: 7.5,
      weight: 800,
      color: "overnightInk",
      align: "center",
      keys: life({ at: 0.72, from: {}, dur: 0.04 }),
    }),
    // 외출은 당일 복귀라 하루짜리 칩이다.
    box("chip-outing", CAL.colX(4) + 3, CAL.rowY(2) + 21, 32, 10, {
      fill: "outing",
      radius: 4,
      keys: life({ at: 0.77, from: { scale: 0.3 }, dur: 0.05, ease: "back" }),
    }),
    text("chip-outing-t", CAL.colX(4) + 3, CAL.rowY(2) + 21, 32, 10, "외출", {
      size: 7.5,
      weight: 800,
      color: "outingInk",
      align: "center",
      keys: life({ at: 0.79, from: {}, dur: 0.04 }),
    }),
  );

  // 범례 — 시트가 다 내려간 뒤 카드 아래 빈자리에 깔린다.
  const legend: [string, TourTone, string, number][] = [
    ["annual", "annual", "연가", 32],
    ["overnight", "overnight", "정기외박", 82],
    ["outing", "outing", "평일 외출", 148],
  ];
  legend.forEach(([id, tone, label, x], index) => {
    const keys = life({ at: 0.84 + index * 0.02, from: { y: 6 }, dur: 0.05 });
    nodes.push(
      box(`lg-${id}`, x, 225, 10, 10, { fill: tone, radius: 3, keys }),
      text(`lg-${id}-t`, x + 14, 223, 60, 14, label, {
        size: 10,
        weight: 700,
        color: "body",
        keys,
      }),
    );
  });

  // 날짜를 누르면 아래에서 올라오는 그날 패널.
  const panel = life({
    at: 0.2,
    from: { y: 70 },
    dur: 0.06,
    leave: 0.37,
    to: { y: 20 },
  });
  nodes.push(
    box("panel", 16, 178, 288, 66, {
      fill: "card",
      radius: 18,
      shadow: true,
      keys: panel,
    }),
    text("panel-date", 32, 190, 150, 18, "10월 13일 (화)", {
      size: 13,
      weight: 800,
      keys: panel,
    }),
    text("panel-sub", 32, 210, 150, 14, "출타 1명 · 여유 있어요", {
      size: 10.5,
      weight: 600,
      color: "mute",
      keys: panel,
    }),
    box("panel-btn", 196, 193, 92, 34, {
      fill: "primary",
      radius: 17,
      keys: merge(panel, press(0.335, 0.94)),
    }),
    text("panel-btn-t", 196, 193, 92, 34, "휴가 등록", {
      size: 12,
      weight: 800,
      color: "onPrimary",
      align: "center",
      keys: merge(panel, press(0.335, 0.94)),
    }),
  );

  // 휴가 등록 시트 — 기간 하나에 종류 두 구간을 담는다.
  const sheet = life({
    at: 0.36,
    from: { y: 150 },
    dur: 0.07,
    leave: 0.585,
    to: { y: 150 },
    leaveDur: 0.06,
  });
  const row1 = life({
    at: 0.43,
    from: { x: 16 },
    dur: 0.05,
    leave: 0.585,
    to: { y: 150 },
    leaveDur: 0.06,
  });
  const row2 = life({
    at: 0.47,
    from: { x: 16 },
    dur: 0.05,
    leave: 0.585,
    to: { y: 150 },
    leaveDur: 0.06,
  });
  const save = merge(sheet, press(0.555, 0.95));
  nodes.push(
    box("sheet", 16, 44, 288, 200, {
      fill: "card",
      radius: 18,
      shadow: true,
      keys: sheet,
    }),
    box("sheet-grip", 144, 52, 32, 4, { fill: "line", radius: 2, keys: sheet }),
    text("sheet-title", 32, 62, 160, 20, "휴가 등록", {
      size: 15,
      weight: 800,
      keys: sheet,
    }),
    box("sheet-period", 32, 90, 256, 32, {
      fill: "soft",
      radius: 10,
      keys: sheet,
    }),
    text("sheet-period-t", 44, 90, 180, 32, "10.13 (화) → 10.16 (금)", {
      size: 12,
      weight: 700,
      keys: sheet,
    }),
    text("sheet-period-n", 220, 90, 56, 32, "4일", {
      size: 12,
      weight: 800,
      color: "brand",
      align: "right",
      keys: sheet,
    }),
    text("sheet-kinds", 32, 130, 120, 14, "휴가 종류", {
      size: 10.5,
      weight: 700,
      color: "mute",
      keys: sheet,
    }),
    box("seg-1", 32, 148, 256, 28, { fill: "annual", radius: 9, keys: row1 }),
    text("seg-1-t", 44, 148, 100, 28, "연가", {
      size: 11.5,
      weight: 800,
      color: "annualInk",
      keys: row1,
    }),
    text("seg-1-n", 140, 148, 136, 28, "10.13 – 10.14 · 2일", {
      size: 10.5,
      weight: 700,
      color: "annualInk",
      align: "right",
      keys: row1,
    }),
    box("seg-2", 32, 180, 256, 28, {
      fill: "overnight",
      radius: 9,
      keys: row2,
    }),
    text("seg-2-t", 44, 180, 100, 28, "정기외박", {
      size: 11.5,
      weight: 800,
      color: "overnightInk",
      keys: row2,
    }),
    text("seg-2-n", 140, 180, 136, 28, "10.15 – 10.16 · 2일", {
      size: 10.5,
      weight: 700,
      color: "overnightInk",
      align: "right",
      keys: row2,
    }),
    box("save", 32, 214, 256, 24, { fill: "primary", radius: 12, keys: save }),
    text("save-t", 32, 214, 256, 24, "저장", {
      size: 11.5,
      weight: 800,
      color: "onPrimary",
      align: "center",
      keys: save,
    }),
  );

  // 외출을 더한 날 위에 잠깐 뜨는 말풍선.
  nodes.push(
    box("bubble", 150, 190, 104, 24, {
      fill: "toast",
      radius: 12,
      shadow: true,
      keys: life({
        at: 0.76,
        from: { y: 8, scale: 0.9 },
        dur: 0.05,
        ease: "back",
        leave: 0.855,
      }),
    }),
    text("bubble-t", 150, 190, 104, 24, "평일 외출 · 1회", {
      size: 10,
      weight: 800,
      color: "onToast",
      align: "center",
      keys: life({
        at: 0.76,
        from: { y: 8, scale: 0.9 },
        dur: 0.05,
        ease: "back",
        leave: 0.855,
      }),
    }),
  );

  nodes.push(
    ...finger(
      "finger",
      [
        { at: 0.14, cx: CAL.colX(2) + 19, cy: CAL.rowY(1) + 8, tap: true },
        { at: 0.31, cx: 242, cy: 210, tap: true },
        { at: 0.53, cx: 160, cy: 226, tap: true },
        { at: 0.71, cx: CAL.colX(4) + 19, cy: CAL.rowY(2) + 8, tap: true },
      ],
      0.79,
    ),
  );
  return nodes;
}

/* 보유 휴가 장면 */

/** 휴가 계획 알약 — 오른쪽 밖에서 미끄러져 들어와 첫 적립분에 흡수된다. */
const PLAN_KEYS: TourKey[] = [
  { at: 0, opacity: 0, x: 190, scale: 1 },
  { at: 0.25, opacity: 0, x: 190 },
  { at: 0.29, opacity: 1, ease: "linear" },
  { at: 0.38, x: 0, ease: "inOut" },
  { at: 0.4, scale: 1, opacity: 1 },
  { at: 0.45, scale: 0.6, opacity: 0, ease: "inOut" },
];

function grantsScene(): TourNode[] {
  const cardIn = life({ at: 0, from: { y: 14 }, dur: 0.07 });
  const row = (index: number) =>
    life({ at: 0.05 + index * 0.035, from: { y: 8 }, dur: 0.06 });
  const total = swapKeys(0.5, 0.02);
  const award = swapKeys(0.48, 0.085);
  const nodes: TourNode[] = [
    box("card", 16, 16, 288, 228, { fill: "card", radius: 18, keys: cardIn }),
    text("title", 32, 32, 140, 20, "보유 휴가", {
      size: 15,
      weight: 800,
      keys: cardIn,
    }),
    text("total-l", 188, 26, 100, 12, "남은 휴가", {
      size: 9.5,
      weight: 700,
      color: "mute",
      align: "right",
      keys: cardIn,
    }),
    text("total-a", 168, 38, 120, 26, "19일", {
      size: 21,
      weight: 900,
      align: "right",
      keys: total.before,
    }),
    text("total-b", 168, 38, 120, 26, "16일", {
      size: 21,
      weight: 900,
      color: "brand",
      align: "right",
      keys: total.after,
    }),

    // 연가
    text("annual-l", 32, 70, 100, 16, "연가", {
      size: 12,
      weight: 800,
      keys: row(0),
    }),
    text("annual-n", 188, 70, 100, 16, "12일", {
      size: 12,
      weight: 800,
      color: "annualInk",
      align: "right",
      keys: row(0),
    }),
    box("annual-track", 32, 92, 256, 8, {
      fill: "soft",
      radius: 4,
      keys: row(0),
    }),
    box("annual-fill", 32, 92, 154, 8, {
      fill: "positive",
      radius: 4,
      origin: "left",
      keys: life({ at: 0.1, from: { sx: 0 }, dur: 0.12 }),
    }),

    // 포상휴가 — 만기가 다른 적립분 두 건
    text("award-l", 32, 110, 100, 16, "포상휴가", {
      size: 12,
      weight: 800,
      keys: row(1),
    }),
    text("award-a", 188, 110, 100, 16, "5일", {
      size: 12,
      weight: 800,
      color: "awardInk",
      align: "right",
      keys: award.before,
    }),
    text("award-b", 188, 110, 100, 16, "2일", {
      size: 12,
      weight: 800,
      color: "awardInk",
      align: "right",
      keys: award.after,
    }),
    box("grant-ghost", 32, 130, 124, 24, {
      stroke: "line",
      radius: 12,
      keys: row(1),
    }),
    text("grant-used", 32, 130, 124, 24, "사용함", {
      size: 10,
      weight: 700,
      color: "mute",
      align: "center",
      keys: life({ at: 0.6, from: { y: 4 }, dur: 0.04 }),
    }),
    box("grant-1", 32, 130, 124, 24, {
      fill: "award",
      radius: 12,
      origin: "left",
      // 비워진 뒤에는 끝까지 숨는다 — 공통 퇴장 키를 붙이면 다시 떠오른다.
      keys: [
        { at: 0, opacity: 0, y: 8 },
        { at: 0.12, opacity: 0, y: 8 },
        { at: 0.18, opacity: 1, y: 0 },
        { at: 0.41, sx: 1 },
        { at: 0.49, sx: 0, ease: "inOut" },
        { at: 0.49, opacity: 1 },
        { at: 0.5, opacity: 0, ease: "linear" },
      ],
    }),
    text("grant-1-t", 32, 130, 124, 24, "~11.30 만기 · 3일", {
      size: 10,
      weight: 800,
      color: "awardInk",
      align: "center",
      keys: life({
        at: 0.085,
        from: { y: 8 },
        dur: 0.06,
        leave: 0.4,
        leaveDur: 0.03,
      }),
    }),
    box("grant-2", 162, 130, 126, 24, {
      fill: "award",
      radius: 12,
      keys: row(1),
    }),
    text("grant-2-t", 162, 130, 126, 24, "~12.31 만기 · 2일", {
      size: 10,
      weight: 800,
      color: "awardInk",
      align: "center",
      keys: row(1),
    }),
    // 3일짜리 계획이 오른쪽에서 들어와 만기가 빠른 적립분 위에 내려앉는다.
    box("plan", 40, 126, 108, 32, {
      fill: "toast",
      radius: 16,
      shadow: true,
      keys: PLAN_KEYS,
    }),
    text("plan-t", 40, 126, 108, 32, "휴가 계획 3일", {
      size: 11,
      weight: 800,
      color: "onToast",
      align: "center",
      keys: PLAN_KEYS,
    }),
    text("minus", 32, 130, 124, 24, "−3일", {
      size: 13,
      weight: 900,
      color: "negative",
      align: "center",
      // 비워진 알약 자리 안에서 떠올랐다가 "사용함"에 자리를 내준다.
      keys: [
        { at: 0, opacity: 0, y: 6, scale: 0.8 },
        { at: 0.45, opacity: 0, y: 6, scale: 0.8 },
        { at: 0.49, opacity: 1, y: 0, scale: 1, ease: "back" },
        { at: 0.56, opacity: 1, y: 0 },
        { at: 0.6, opacity: 0, y: -6 },
      ],
    }),

    // 정기외박 — 주기마다 쌓인다
    text("overnight-l", 32, 164, 100, 16, "정기외박", {
      size: 12,
      weight: 800,
      keys: row(2),
    }),
    text("overnight-n", 188, 164, 100, 16, "2일", {
      size: 12,
      weight: 800,
      color: "overnightInk",
      align: "right",
      keys: row(2),
    }),
    text("overnight-s", 32, 182, 220, 14, "다음 주기 11월 2일에 또 쌓여요", {
      size: 10,
      weight: 600,
      color: "mute",
      keys: row(2),
    }),

    // 외출 — 일수가 아니라 횟수
    text("outing-l", 32, 200, 100, 16, "평일 외출", {
      size: 12,
      weight: 800,
      keys: row(3),
    }),
    text("outing-n", 188, 200, 100, 16, "2회", {
      size: 12,
      weight: 800,
      color: "outingInk",
      align: "right",
      keys: row(3),
    }),

    box("note", 32, 220, 256, 20, {
      fill: "pale",
      radius: 10,
      keys: life({ at: 0.56, from: { y: 6, scale: 0.96 }, dur: 0.06 }),
    }),
    text("note-t", 32, 220, 256, 20, "만기가 빠른 적립분부터 빠져요", {
      size: 10,
      weight: 800,
      color: "brand",
      align: "center",
      keys: life({ at: 0.56, from: { y: 6, scale: 0.96 }, dur: 0.06 }),
    }),
  ];
  return nodes;
}

/* 공유 그룹 장면 */

function unitScene(): TourNode[] {
  const cardIn = life({ at: 0, from: { y: 14 }, dur: 0.07 });
  const mainIn = life({ at: 0.05, from: { y: 14 }, dur: 0.07 });
  const nodes: TourNode[] = [
    box("group", 16, 16, 288, 62, { fill: "card", radius: 16, keys: cardIn }),
    text("group-l", 32, 26, 150, 12, "초대코드로 모인 공유 그룹", {
      size: 9.5,
      weight: 700,
      color: "mute",
      keys: cardIn,
    }),
    text("group-n", 32, 40, 140, 22, "3생활관", {
      size: 16,
      weight: 900,
      keys: cardIn,
    }),
  ];

  // 부대원이 하나씩 그룹에 들어온다. 마지막이 나다.
  const people: {
    id: string;
    initial: string;
    fill: TourTone;
    ink: TourTone;
  }[] = [
    { id: "a", initial: "민", fill: "annual", ink: "annualInk" },
    { id: "b", initial: "준", fill: "award", ink: "awardInk" },
    { id: "c", initial: "서", fill: "overnight", ink: "overnightInk" },
    { id: "me", initial: "나", fill: "primary", ink: "onPrimary" },
  ];
  people.forEach((person, index) => {
    const x = 178 + index * 20;
    const keys = life({
      at: 0.07 + index * 0.035,
      from: { y: 34, scale: 0.4 },
      dur: 0.06,
      ease: "back",
    });
    nodes.push(
      box(`av-${person.id}`, x, 33, 30, 30, {
        fill: person.fill,
        stroke: "card",
        radius: 15,
        keys,
      }),
      text(`av-${person.id}-t`, x, 33, 30, 30, person.initial, {
        size: 11.5,
        weight: 800,
        color: person.ink,
        align: "center",
        keys,
      }),
    );
  });
  nodes.push(
    text("count", 260, 33, 36, 30, "4명", {
      size: 12,
      weight: 800,
      color: "body",
      align: "right",
      keys: life({ at: 0.2, from: { x: -6 }, dur: 0.05 }),
    }),
  );

  // 날짜별 출타 인원 막대.
  const colX = (col: number) => 40 + col * 36.5;
  const segY = (stack: number) => 214 - 22 * (stack + 1) - 3 * stack;
  nodes.push(
    box("main", 16, 86, 288, 158, { fill: "card", radius: 16, keys: mainIn }),
    text("main-t", 32, 98, 150, 16, "날짜별 출타 인원", {
      size: 12,
      weight: 800,
      keys: mainIn,
    }),
    text("main-max", 168, 98, 120, 16, "하루 최대 2명", {
      size: 10,
      weight: 700,
      color: "mute",
      align: "right",
      keys: mainIn,
    }),
    // 한도선. 막대 두 칸 위에 걸친다.
    box("limit", 32, segY(1) - 3, 256, 1.5, {
      fill: "negative",
      origin: "left",
      keys: [
        { at: 0, opacity: 0, sx: 0 },
        { at: 0.18, opacity: 0, sx: 0 },
        { at: 0.26, opacity: 0.55, sx: 1 },
        { at: EXIT_FROM, opacity: 0.55 },
        { at: EXIT_TO, opacity: 0 },
      ],
    }),
  );

  const stacks: string[][] = [
    ["a"],
    ["a", "b"],
    ["b"],
    ["b", "c"],
    ["c"],
    [],
    [],
  ];
  const tones = Object.fromEntries(
    people.map((person) => [person.id, person.fill]),
  ) as Record<string, TourTone>;
  let order = 0;
  stacks.forEach((stack, col) => {
    stack.forEach((personId, level) => {
      nodes.push(
        box(`bar-${col}-${level}`, colX(col), segY(level), 22, 22, {
          fill: tones[personId],
          radius: 6,
          origin: "bottom",
          keys: life({ at: 0.22 + order * 0.018, from: { sy: 0 }, dur: 0.06 }),
        }),
      );
      order++;
    });
  });

  // 내가 15일(목)에 휴가를 더하자 세 명이 되어 한도를 넘는다.
  const overCol = 3;
  nodes.push(
    box("bar-me", colX(overCol), segY(2), 22, 22, {
      fill: "primary",
      radius: 6,
      keys: life({
        at: 0.4,
        from: { y: -46, scale: 0.6 },
        dur: 0.07,
        ease: "back",
      }),
    }),
  );
  [0, 1, 2].forEach((level) => {
    nodes.push(
      box(`over-${level}`, colX(overCol), segY(level), 22, 22, {
        fill: "negative",
        radius: 6,
        keys: life({
          at: 0.5 + level * 0.015,
          from: { scale: 0.7 },
          dur: 0.05,
          ease: "back",
        }),
      }),
    );
  });

  ["12", "13", "14", "15", "16", "17", "18"].forEach((date, col) => {
    nodes.push(
      text(`day-${col}`, colX(col) - 6, 220, 34, 14, date, {
        size: 10,
        weight: 700,
        color: col === 6 ? "negative" : "mute",
        align: "center",
        keys: mainIn,
      }),
    );
  });
  nodes.push(
    box("day-over", colX(overCol) - 3, 219, 28, 16, {
      fill: "negative",
      radius: 8,
      keys: life({ at: 0.52, from: { scale: 0.5 }, dur: 0.05, ease: "back" }),
    }),
    text("day-over-t", colX(overCol) - 3, 219, 28, 16, "15", {
      size: 10,
      weight: 800,
      color: "onToast",
      align: "center",
      keys: life({ at: 0.52, from: { scale: 0.5 }, dur: 0.05, ease: "back" }),
    }),
  );

  // 넘친 날 나가는 사람 모두에게 알림이 간다.
  const toast = life({
    at: 0.58,
    from: { y: -18, scale: 0.94 },
    dur: 0.06,
    ease: "back",
  });
  nodes.push(
    box("toast", 24, 92, 272, 48, {
      fill: "toast",
      radius: 14,
      shadow: true,
      keys: toast,
    }),
    icon(
      "toast-bell",
      38,
      104,
      22,
      "bell",
      "primary",
      merge(toast, [
        { at: 0.64, rotate: 0 },
        { at: 0.66, rotate: -16, ease: "out" },
        { at: 0.68, rotate: 13, ease: "inOut" },
        { at: 0.7, rotate: -9, ease: "inOut" },
        { at: 0.72, rotate: 5, ease: "inOut" },
        { at: 0.74, rotate: 0, ease: "out" },
      ]),
    ),
    text("toast-t", 70, 99, 216, 18, "10월 15일 출타 인원 초과", {
      size: 12,
      weight: 800,
      color: "onToast",
      keys: toast,
    }),
    text(
      "toast-s",
      70,
      118,
      216,
      14,
      "3명 / 최대 2명 · 그날 나가는 3명에게 알렸어요",
      {
        size: 9.5,
        weight: 600,
        color: "toastMute",
        keys: toast,
      },
    ),
  );
  // 알림을 받은 세 사람의 아바타에 점이 찍힌다.
  ["b", "c", "me"].forEach((personId, index) => {
    const x = 178 + people.findIndex((person) => person.id === personId) * 20;
    nodes.push(
      box(`dot-${personId}`, x + 21, 31, 10, 10, {
        fill: "negative",
        stroke: "card",
        radius: 5,
        keys: life({
          at: 0.66 + index * 0.02,
          from: { scale: 0 },
          dur: 0.04,
          ease: "back",
        }),
      }),
    );
  });
  return nodes;
}

/* 친구 장면 */

function friendsScene(): TourNode[] {
  const cardIn = life({ at: 0, from: { y: 14 }, dur: 0.07 });
  const typed = (value: string, at: number, until?: number) =>
    text(`typed-${value.length}`, 56, 16, 220, 44, value, {
      size: 13.5,
      weight: 800,
      keys: until
        ? life({ at, from: {}, dur: 0.004, leave: until, leaveDur: 0.004 })
        : life({ at, from: {}, dur: 0.004 }),
    });
  const result = life({ at: 0.24, from: { y: 12 }, dur: 0.06 });
  const requestBtn = life({
    at: 0.24,
    from: { y: 12 },
    dur: 0.06,
    leave: 0.35,
    leaveDur: 0.02,
  });
  const pendingBtn = life({
    at: 0.35,
    from: { scale: 0.9 },
    dur: 0.03,
    leave: 0.5,
    leaveDur: 0.02,
  });
  const acceptedBtn = life({
    at: 0.5,
    from: { scale: 0.7 },
    dur: 0.05,
    ease: "back",
  });
  const compare = life({ at: 0.56, from: { y: 16 }, dur: 0.07 });

  const dayX = (day: number) => 74 + (day - 12) * 15;
  const nodes: TourNode[] = [
    box("search", 16, 16, 288, 44, { fill: "card", radius: 14, keys: cardIn }),
    icon("search-i", 28, 27, 22, "search", "mute", cardIn),
    text("placeholder", 56, 16, 220, 44, "@아이디로 친구 찾기", {
      size: 13,
      weight: 600,
      color: "mute",
      keys: life({
        at: 0,
        from: { y: 14 },
        dur: 0.07,
        leave: 0.1,
        leaveDur: 0.004,
      }),
    }),
    typed("@m", 0.1, 0.13),
    typed("@min", 0.13, 0.165),
    typed("@minjun", 0.165),

    box("result", 16, 68, 288, 64, { fill: "card", radius: 14, keys: result }),
    box("avatar", 30, 80, 40, 40, { fill: "friend", radius: 20, keys: result }),
    text("avatar-t", 30, 80, 40, 40, "민", {
      size: 15,
      weight: 800,
      color: "friendInk",
      align: "center",
      keys: result,
    }),
    text("name", 80, 82, 120, 18, "김민준", {
      size: 13.5,
      weight: 800,
      keys: result,
    }),
    text("handle", 80, 102, 124, 14, "@minjun · 해군", {
      size: 10.5,
      weight: 600,
      color: "mute",
      keys: life({
        at: 0.24,
        from: { y: 12 },
        dur: 0.06,
        leave: 0.6,
        leaveDur: 0.03,
      }),
    }),
    text("ddays", 80, 102, 124, 14, "전역 D-214 · 휴가 D-12", {
      size: 10.5,
      weight: 800,
      color: "brand",
      keys: life({ at: 0.63, from: { y: 6 }, dur: 0.05 }),
    }),
    box("req", 204, 84, 88, 32, {
      fill: "primary",
      radius: 16,
      keys: merge(requestBtn, press(0.325, 0.92)),
    }),
    text("req-t", 204, 84, 88, 32, "친구 요청", {
      size: 11.5,
      weight: 800,
      color: "onPrimary",
      align: "center",
      keys: merge(requestBtn, press(0.325, 0.92)),
    }),
    box("pending", 204, 84, 88, 32, {
      fill: "soft",
      radius: 16,
      keys: pendingBtn,
    }),
    text("pending-t", 204, 84, 88, 32, "요청됨", {
      size: 11.5,
      weight: 800,
      color: "mute",
      align: "center",
      keys: pendingBtn,
    }),
    box("accepted", 204, 84, 88, 32, {
      fill: "pale",
      radius: 16,
      keys: acceptedBtn,
    }),
    icon("accepted-i", 216, 91, 18, "check", "brand", acceptedBtn),
    text("accepted-t", 236, 84, 48, 32, "친구", {
      size: 11.5,
      weight: 800,
      color: "brand",
      keys: acceptedBtn,
    }),

    // 비교 달력 — 친구의 출타 일정이 내 일정 옆에 나란히 깔린다.
    box("compare", 16, 140, 288, 104, {
      fill: "card",
      radius: 14,
      keys: compare,
    }),
    text("compare-t", 30, 150, 170, 16, "10월 · 친구와 나란히 보기", {
      size: 11.5,
      weight: 800,
      keys: compare,
    }),
    box("overlap", dayX(15) - 3, 170, 2 * 15 + 4, 46, {
      fill: "pale",
      radius: 8,
      keys: life({ at: 0.74, from: { scale: 0.85 }, dur: 0.05, ease: "back" }),
    }),
    text("me-l", 30, 172, 40, 18, "나", {
      size: 11,
      weight: 800,
      keys: compare,
    }),
    box("me-track", dayX(12), 176, 210, 10, {
      fill: "soft",
      radius: 5,
      keys: compare,
    }),
    box("me-bar", dayX(13), 176, 4 * 15 - 2, 10, {
      fill: "positive",
      radius: 5,
      origin: "left",
      keys: life({ at: 0.62, from: { sx: 0 }, dur: 0.07 }),
    }),
    text("friend-l", 30, 198, 40, 18, "민준", {
      size: 11,
      weight: 800,
      keys: compare,
    }),
    box("friend-track", dayX(12), 202, 210, 10, {
      fill: "soft",
      radius: 5,
      keys: compare,
    }),
    box("friend-bar", dayX(15), 202, 5 * 15 - 2, 10, {
      fill: "friendBar",
      radius: 5,
      origin: "left",
      keys: life({ at: 0.68, from: { sx: 0 }, dur: 0.07 }),
    }),
    text("overlap-t", 30, 224, 258, 14, "15–16일은 둘 다 밖이에요", {
      size: 10,
      weight: 800,
      color: "brand",
      keys: life({ at: 0.77, from: { y: 6 }, dur: 0.05 }),
    }),
  ];

  // 수락 알림 토스트.
  const toast = life({
    at: 0.46,
    from: { y: -14, scale: 0.94 },
    dur: 0.05,
    ease: "back",
    leave: 0.6,
  });
  nodes.push(
    box("toast", 16, 16, 288, 44, {
      fill: "toast",
      radius: 14,
      shadow: true,
      keys: toast,
    }),
    icon("toast-i", 30, 29, 18, "check", "primary", toast),
    text("toast-t", 56, 16, 236, 44, "김민준님이 친구 요청을 수락했어요", {
      size: 10.5,
      weight: 800,
      color: "onToast",
      keys: toast,
    }),
  );

  nodes.push(
    ...finger("finger", [{ at: 0.3, cx: 248, cy: 100, tap: true }], 0.4),
  );
  return nodes;
}

/* 복무율 장면 */

function progressScene(): TourNode[] {
  const cardIn = life({ at: 0, from: { y: 14 }, dur: 0.07 });
  // 육군 18개월 기준 342일째 — 62.48%, 남은 206일, 병장(14개월)까지 84일.
  const values = ["0.00%", "24.31%", "47.95%", "62.48%"];
  const nodes: TourNode[] = [
    box("card", 16, 16, 288, 228, {
      fill: "nightCard",
      radius: 20,
      keys: cardIn,
    }),
    text("label", 32, 30, 120, 14, "복무율", {
      size: 11,
      weight: 700,
      color: "nightMute",
      keys: cardIn,
    }),
    box("rank", 236, 26, 52, 22, {
      fill: "primary",
      radius: 11,
      keys: life({ at: 0.22, from: { scale: 0.4 }, dur: 0.06, ease: "back" }),
    }),
    text("rank-t", 236, 26, 52, 22, "상병", {
      size: 11,
      weight: 800,
      color: "onPrimary",
      align: "center",
      keys: life({ at: 0.22, from: { scale: 0.4 }, dur: 0.06, ease: "back" }),
    }),
  ];
  values.forEach((value, index) => {
    const at = 0.05 + index * 0.055;
    const last = index === values.length - 1;
    nodes.push(
      text(`pct-${index}`, 32, 46, 240, 52, value, {
        size: 44,
        weight: 900,
        color: "primary",
        keys: last
          ? life({ at, from: { y: 16 }, dur: 0.045 })
          : // 다음 값이 오르기 전에 완전히 빠진다 — 겹치면 큰 숫자 두 개가 번져 보인다.
            life({
              at,
              from: { y: 16 },
              dur: 0.035,
              leave: at + 0.04,
              to: { y: -10 },
              leaveDur: 0.014,
            }),
      }),
    );
  });
  nodes.push(
    text("left", 32, 98, 256, 14, "전역까지 206일 · 2027년 4월 27일", {
      size: 11,
      weight: 600,
      color: "nightMute",
      keys: life({ at: 0.26, from: { y: 6 }, dur: 0.05 }),
    }),
    box("track", 32, 122, 256, 10, {
      fill: "nightLine",
      radius: 5,
      keys: cardIn,
    }),
    box("fill", 32, 122, 160, 10, {
      fill: "primary",
      radius: 5,
      origin: "left",
      keys: life({ at: 0.05, from: { sx: 0 }, dur: 0.21, ease: "out" }),
    }),
  );

  // 진급 시점(2·8·14개월 / 18개월)의 눈금. 막대가 지나가면 차례로 켜진다.
  const ranks: [string, number, number][] = [
    ["일병", 2 / 18, 0.08],
    ["상병", 8 / 18, 0.15],
    ["병장", 14 / 18, 0.27],
  ];
  ranks.forEach(([label, ratio, at], index) => {
    const x = 32 + 256 * ratio;
    const reached = index < 2;
    const keys = life({
      at,
      from: { y: 4, scale: 0.6 },
      dur: 0.05,
      ease: "back",
    });
    nodes.push(
      box(`tick-${index}`, x - 1, 118, 2, 18, {
        fill: reached ? "nightText" : "nightMute",
        radius: 1,
        keys,
      }),
      text(`tick-${index}-t`, x - 20, 138, 40, 12, label, {
        size: 9.5,
        weight: 700,
        color: reached ? "nightText" : "nightMute",
        align: "center",
        keys,
      }),
    );
  });

  // 소수점 아래 자리는 지금도 계속 오른다 — 확대한 막대가 끊임없이 차고 비운다.
  const sweep: TourKey[] = [
    { at: 0, opacity: 0, sx: 0 },
    { at: 0.3, opacity: 0, sx: 0 },
    { at: 0.33, opacity: 1, ease: "linear" },
    { at: 0.5, sx: 1, ease: "linear" },
    { at: 0.5001, sx: 0, ease: "linear" },
    { at: 0.7, sx: 1, ease: "linear" },
    { at: 0.7001, sx: 0, ease: "linear" },
    { at: 0.9, sx: 1, ease: "linear" },
    { at: 0.9001, sx: 0, ease: "linear" },
    { at: EXIT_FROM, opacity: 1, sx: 0.15, ease: "linear" },
    { at: EXIT_TO, opacity: 0 },
  ];
  nodes.push(
    text(
      "zoom-l",
      32,
      156,
      256,
      14,
      "소수점 아래 자리까지 실시간으로 차올라요",
      {
        size: 10,
        weight: 600,
        color: "nightMute",
        keys: life({ at: 0.3, from: { y: 6 }, dur: 0.05 }),
      },
    ),
    box("zoom-track", 32, 174, 256, 4, {
      fill: "nightLine",
      radius: 2,
      keys: life({ at: 0.3, from: {}, dur: 0.05 }),
    }),
    box("zoom-fill", 32, 174, 256, 4, {
      fill: "positive",
      radius: 2,
      origin: "left",
      keys: sweep,
    }),
  );

  const tiles: [string, string][] = [
    ["전역까지", "D-206"],
    ["남은 일과일", "138일"],
    ["병장까지", "D-84"],
  ];
  tiles.forEach(([label, value], index) => {
    const x = 32 + index * 88;
    const keys = life({ at: 0.36 + index * 0.04, from: { y: 12 }, dur: 0.06 });
    nodes.push(
      box(`tile-${index}`, x, 188, 80, 44, {
        fill: "nightLine",
        radius: 12,
        keys,
      }),
      text(`tile-${index}-l`, x + 10, 195, 64, 12, label, {
        size: 9,
        weight: 700,
        color: "nightMute",
        keys,
      }),
      text(`tile-${index}-v`, x + 10, 209, 64, 18, value, {
        size: 15,
        weight: 900,
        color: "nightText",
        keys,
      }),
    );
  });
  return nodes;
}

export type TourSceneId = "leave" | "grants" | "unit" | "friends" | "progress";

export interface TourScene {
  id: TourSceneId;
  /** 탭에 붙는 짧은 이름. */
  label: string;
  /** 장면 제목. 기능 이름이 아니라 사용자가 할 일로 적는다. */
  title: string;
  /** 그림이 보여주는 동작을 글로 한 번 더. */
  body: string;
  /** 그림에 다 담지 못한 규칙 두세 줄. */
  points: readonly string[];
  backdrop: TourBackdrop;
  /** 한 바퀴 길이(ms). */
  duration: number;
  /**
   * 동작 줄이기 설정에서 멈춰 보여줄 시점. 장면의 모든 결과가 다 깔려 있고
   * 손가락·말풍선처럼 중간에만 뜨는 것은 사라진 순간을 고른다.
   */
  poster: number;
  nodes: readonly TourNode[];
}

/**
 * 사용법 투어의 장면 순서.
 *
 * 처음 쓰는 사람이 실제로 밟는 순서를 따른다 — 내 휴가를 등록하고, 남은 휴가를
 * 확인하고, 부대원·친구와 맞춰 보고, 마지막으로 복무율을 본다. 복무율이 끝에
 * 있는 것은 바로 다음 완료 단계가 같은 숫자를 요약하기 때문이다.
 */
export const ONBOARDING_TOUR: readonly TourScene[] = [
  {
    id: "leave",
    label: "휴가 등록",
    title: "달력에서 휴가·외박·외출을 등록해요",
    body: "날짜를 누르고 휴가 등록을 고르면 기간과 종류를 담는 시트가 열려요. 연가와 정기외박처럼 종류가 섞인 일정도 구간으로 나눠 한 번에 담아요.",
    points: [
      "외출은 당일 복귀라 하루짜리로 등록하고, 일수가 아니라 횟수로 세요.",
      "초안으로 두면 나만 보고, 공유하면 그룹의 출타 인원에 들어가요.",
    ],
    backdrop: "green",
    duration: 7600,
    poster: 0.9,
    nodes: leaveScene(),
  },
  {
    id: "grants",
    label: "보유 휴가",
    title: "남은 휴가는 적립분 단위로 세요",
    body: "연가·포상휴가는 받은 건마다 만기가 달라 따로 쌓이고, 휴가를 쓰면 만기가 빠른 적립분부터 빠져요. 보유 휴가 화면에서 종류별 잔여를 한눈에 봐요.",
    points: [
      "받은 휴가는 보유 휴가에서 직접 추가하고 고칠 수 있어요.",
      "정기외박은 설정한 주기마다 자동으로 쌓여요.",
    ],
    backdrop: "amber",
    duration: 6600,
    poster: 0.9,
    nodes: grantsScene(),
  },
  {
    id: "unit",
    label: "공유 그룹",
    title: "부대원과 출타 인원을 맞춰요",
    body: "초대코드로 같은 부대원끼리 공유 그룹을 만들면 날짜마다 몇 명이 나가는지 세어 줘요. 그룹이 정한 하루 최대 출타 인원을 넘는 날은 빨갛게 표시돼요.",
    points: [
      "넘친 날에는 등록한 사람만이 아니라 그날 휴가인 부대원 모두에게 알림이 가요.",
      "한 사람이 휴가를 여러 건 등록해도 그날 1명으로 세요.",
    ],
    backdrop: "blue",
    duration: 7200,
    poster: 0.9,
    nodes: unitScene(),
  },
  {
    id: "friends",
    label: "친구",
    title: "부대가 달라도 @아이디로 친구를 맺어요",
    body: "친구 탭에서 @아이디로 요청하고 상대가 수락하면, 친구의 휴가·외출 일정을 내 달력에 나란히 볼 수 있어요. 초대코드는 필요 없어요.",
    points: [
      "친구의 전역·다음 휴가 D-day와 복무율도 함께 보여요.",
      "무엇을 보여줄지는 공유 설정에서 내가 골라요.",
    ],
    backdrop: "violet",
    duration: 7200,
    poster: 0.9,
    nodes: friendsScene(),
  },
  {
    id: "progress",
    label: "복무율",
    title: "복무율과 전역까지 남은 날을 봐요",
    body: "입대일과 전역일로 복무율을 소수점 아래까지 실시간으로 계산해요. 진급 예정일과 남은 일과일도 함께 보여줘요.",
    points: [
      "남은 일과일은 주말·공휴일과 휴가로 나가 있는 날을 빼고 세요.",
      "계급은 입대일 기준 진급표대로 자동으로 올라가요.",
    ],
    backdrop: "night",
    duration: 6800,
    poster: 0.9,
    nodes: progressScene(),
  },
];
