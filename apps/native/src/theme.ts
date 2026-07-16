/** DESIGN.md (Wise-inspired) 토큰 — 웹과 동일한 팔레트/라운드/간격. */
export const colors = {
  primary: "#9fe870",
  onPrimary: "#0e0f0c",
  primaryActive: "#cdffad",
  primaryPale: "#e2f6d5",
  ink: "#0e0f0c",
  inkDeep: "#163300",
  body: "#454745",
  mute: "#868685",
  canvas: "#ffffff",
  canvasSoft: "#e8ebe6",
  positive: "#2ead4b",
  positiveDeep: "#054d28",
  warning: "#ffd11a",
  warningContent: "#4a3b1c",
  negative: "#d03238",
  negativeDeep: "#a72027",
  negativeBg: "#320707",
  negativeTint: "rgba(208, 50, 56, 0.09)",
} as const;

export const radius = {
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

/** iPad/가로 모드에서 달력+패널 나란히 배치하는 기준 폭. */
export const WIDE_BREAKPOINT = 768;
