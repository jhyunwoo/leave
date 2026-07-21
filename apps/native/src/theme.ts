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
} as const;

export const motion = {
  pressScale: 0.97,
  quick: 150,
  standard: 220,
} as const;

/** iPad/가로 모드에서 달력+패널 나란히 배치하는 기준 폭. */
export const WIDE_BREAKPOINT = 768;
