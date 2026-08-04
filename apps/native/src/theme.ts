import { DynamicColorIOS, PlatformColor, type ColorValue } from "react-native";

function systemColor(ios: string, android: string, web: string): ColorValue {
  if (process.env.EXPO_OS === "ios") return PlatformColor(ios);
  if (process.env.EXPO_OS === "android") return PlatformColor(android);
  return web;
}

function adaptiveBrand(light: string, dark: string): ColorValue {
  return process.env.EXPO_OS === "ios"
    ? DynamicColorIOS({ light, dark })
    : light;
}

/**
 * 리브 네이티브 디자인 토큰.
 *
 * 정보색은 기존 브랜드 의미를 유지하고, 배경·텍스트·구분선은 각 플랫폼의
 * 시스템 색을 따라 라이트/다크 모드와 접근성 대비에 자동 적응한다.
 */
export const colors = {
  primary: adaptiveBrand("#9fe870", "#70c945"),
  onPrimary: adaptiveBrand("#0e0f0c", "#071005"),
  primaryActive: adaptiveBrand("#cdffad", "#8edb60"),
  primaryDisabled: systemColor(
    "tertiarySystemFill",
    "?android:attr/colorControlNormal",
    "#d6dbd3",
  ),
  primaryPale: adaptiveBrand("#e2f6d5", "#213d18"),
  primaryNeutral: adaptiveBrand("#c5edab", "#315523"),
  ink: systemColor("label", "?android:attr/textColorPrimary", "#0e0f0c"),
  inkDeep: adaptiveBrand("#163300", "#d7ffbf"),
  body: systemColor(
    "secondaryLabel",
    "?android:attr/textColorSecondary",
    "#454745",
  ),
  mute: systemColor(
    "tertiaryLabel",
    "?android:attr/textColorSecondary",
    "#868685",
  ),
  mutedSoft: systemColor(
    "quaternaryLabel",
    "?android:attr/textColorSecondary",
    "#9a9c99",
  ),
  canvas: systemColor(
    "systemBackground",
    "?android:attr/colorBackground",
    "#ffffff",
  ),
  canvasSoft: systemColor(
    "systemGroupedBackground",
    "?android:attr/colorBackground",
    "#e8ebe6",
  ),
  surfaceCard: systemColor(
    "secondarySystemGroupedBackground",
    "?android:attr/colorBackground",
    "#f3f5f1",
  ),
  surfaceStrong: systemColor(
    "tertiarySystemFill",
    "?android:attr/colorControlNormal",
    "#d8ddd5",
  ),
  hairline: systemColor("separator", "?android:attr/listDivider", "#d7dbd4"),
  brand: adaptiveBrand("#347a1f", "#79d553"),
  positive: adaptiveBrand("#2ead4b", "#45d265"),
  positiveDeep: adaptiveBrand("#054d28", "#8be7a2"),
  warning: adaptiveBrand("#ffd11a", "#ffd60a"),
  warningContent: adaptiveBrand("#4a3b1c", "#fff0a6"),
  negative: systemColor("systemRed", "?android:attr/colorError", "#d03238"),
  negativeDeep: adaptiveBrand("#a72027", "#ff8b91"),
  negativeBg: adaptiveBrand("#320707", "#4b1114"),
  negativeTint: adaptiveBrand("#fff0f0", "#3d1517"),
  /** 달력에서 현재 정기외박 주기 범위를 아주 옅게 깔아주는 배경. */
  cycleTint: adaptiveBrand("#f5f8fb", "#17202a"),
};

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

export const layout = {
  /** iPad·가로 화면에서 목록과 폼의 읽기 거리가 지나치게 길어지지 않게 한다. */
  readableContent: 760,
} as const;

export const type = {
  displayWeight: "900" as const,
  titleWeight: "600" as const,
  bodyWeight: "400" as const,
  displayTracking: -1.1,
  /** 네이티브 Stack large title과 같은 위계를 쓰는 보조 화면 제목. */
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
