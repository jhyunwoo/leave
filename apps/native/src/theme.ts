/** 리브 네이티브 디자인 토큰 — DESIGN.md와 웹의 Wise-inspired 시스템을 공유한다. */
export const colors = {
  primary: "#9fe870",
  onPrimary: "#0e0f0c",
  primaryActive: "#cdffad",
  primaryDisabled: "#d6dbd3",
  primaryPale: "#e2f6d5",
  primaryNeutral: "#c5edab",
  ink: "#0e0f0c",
  inkDeep: "#163300",
  body: "#454745",
  mute: "#868685",
  mutedSoft: "#9a9c99",
  canvas: "#ffffff",
  canvasSoft: "#e8ebe6",
  surfaceCard: "#f3f5f1",
  surfaceStrong: "#d8ddd5",
  hairline: "#d7dbd4",
  brand: "#347a1f",
  positive: "#2ead4b",
  positiveDeep: "#054d28",
  warning: "#ffd11a",
  warningContent: "#4a3b1c",
  negative: "#d03238",
  negativeDeep: "#a72027",
  negativeBg: "#320707",
  negativeTint: "#fff0f0",
  /** 달력에서 현재 정기외박 주기 범위를 아주 옅게 깔아주는 배경. */
  cycleTint: "#f5f8fb",
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const type = {
  displayWeight: "900" as const,
  titleWeight: "600" as const,
  bodyWeight: "400" as const,
  displayTracking: -1.1,
  /** 탭 화면 제목. 네 탭이 ScreenHeader를 통해 공유한다. */
  screenTitle: {
    fontSize: 32,
    fontWeight: "900" as const,
    letterSpacing: -0.7,
  },
  screenSubtitle: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
} as const;

/**
 * 휴가 재원별 색. 달력에서 내 휴가가 어떤 재원인지 한눈에 구분하는 용도라
 * 서로 충분히 다른 색조를 쓴다. bg는 칩 배경, fg는 그 위의 글자색.
 */
export const BALANCE_COLORS = {
  annual: { fg: "#1f5e10", bg: "#d8f3c4" },
  award: { fg: "#8a4b00", bg: "#ffe8c7" },
  compensation: { fg: "#4c2c9c", bg: "#e6ddff" },
  consolation: { fg: "#9c1d55", bg: "#ffdcea" },
  petition: { fg: "#0b5c55", bg: "#c9efeb" },
  sick: { fg: "#a72027", bg: "#ffdcdd" },
  regular_overnight: { fg: "#12439c", bg: "#d8e6ff" },
  other_overnight: { fg: "#065b7a", bg: "#cdeaf6" },
  outing: { fg: "#454745", bg: "#e4e7e2" },
  other: { fg: "#5a5c59", bg: "#eceee9" },
} as const;

export const motion = {
  pressScale: 0.97,
  quick: 150,
  standard: 220,
} as const;

/** iPad/가로 모드에서 달력+패널 나란히 배치하는 기준 폭. */
export const WIDE_BREAKPOINT = 768;
