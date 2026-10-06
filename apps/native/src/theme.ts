/** 모든 플랫폼에 같은 확정 hex를 전달하도록 라이트/다크 팔레트를 JS에서 선택한다.
 * React 밖의 모듈에는 호출하는 컴포넌트가 현재 색을 인자로 전달한다. */

import {
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { type BalancePalette } from "./balance-tone";

export {
  balanceTone,
  type BalancePalette,
  type BalanceTone,
} from "./balance-tone";

export type ColorScheme = "light" | "dark";

export type Palette = {
  primary: string;
  onPrimary: string;
  primaryActive: string;
  primaryDisabled: string;
  primaryPale: string;
  primaryNeutral: string;
  ink: string;
  inkDeep: string;
  body: string;
  mute: string;
  mutedSoft: string;
  canvas: string;
  canvasSoft: string;
  surfaceCard: string;
  surfaceStrong: string;
  hairline: string;
  brand: string;
  /** `brand` 채움 위에 얹는 글자색. 달력의 전역일 배지처럼 brand를 배경으로 쓸 때만. */
  onBrand: string;
  positive: string;
  positiveDeep: string;
  warning: string;
  /** `warning` 채움 위에 얹는 글자색. 채움이 두 스킴 모두 밝은 노랑이라 값이 같다. */
  onWarning: string;
  /** 중립 표면 위에 쓰는 "경고색 글자". `warning` 채움 위에는 쓰지 않는다. */
  warningContent: string;
  negative: string;
  negativeDeep: string;
  negativeBg: string;
  /** `negativeBg`·`negativeDeep` 채움 위에 얹는 글자색. 두 스킴 모두 흰색. */
  onNegativeBg: string;
  negativeTint: string;
  /** 달력에서 현재 정기외박 주기 범위를 아주 옅게 깔아주는 배경. */
  cycleTint: string;
  /** 선택 날짜의 숫자는 비쳐 보이게 두고, 잉크색 테두리로 선택 상태를 구분한다. */
  selectedTint: string;
};

/** 라이트는 canvasSoft < surfaceCard < canvas, 다크는 canvasSoft < canvas < surfaceCard로 표면을 구분한다. */
const lightColors: Palette = {
  primary: "#9fe870",
  onPrimary: "#0e0f0c",
  primaryActive: "#cdffad",
  primaryDisabled: "rgba(120, 120, 128, 0.12)",
  primaryPale: "#e2f6d5",
  primaryNeutral: "#c5edab",
  ink: "#0e0f0c",
  inkDeep: "#163300",
  body: "#454745",
  mute: "#656963",
  mutedSoft: "#9a9c99",
  canvas: "#ffffff",
  canvasSoft: "#eceee9",
  surfaceCard: "#f2f4f0",
  surfaceStrong: "#d8ddd5",
  hairline: "#d7dbd4",
  brand: "#347a1f",
  onBrand: "#ffffff",
  positive: "#2ead4b",
  positiveDeep: "#054d28",
  warning: "#ffd11a",
  onWarning: "#3d2f0b",
  warningContent: "#4a3b1c",
  negative: "#d03238",
  negativeDeep: "#a72027",
  negativeBg: "#320707",
  onNegativeBg: "#ffffff",
  negativeTint: "#fff0f0",
  cycleTint: "#f5f8fb",
  selectedTint: "rgba(14, 15, 12, 0.16)",
};

const darkColors: Palette = {
  primary: "#70c945",
  onPrimary: "#071005",
  primaryActive: "#8edb60",
  primaryDisabled: "rgba(120, 120, 128, 0.24)",
  primaryPale: "#213d18",
  primaryNeutral: "#315523",
  ink: "#f2f4f0",
  inkDeep: "#d7ffbf",
  body: "#b9bdb6",
  mute: "#a0a59d",
  mutedSoft: "#6d706b",
  canvas: "#1c1c1e",
  canvasSoft: "#000000",
  surfaceCard: "#2c2c2e",
  surfaceStrong: "#3a3a3c",
  hairline: "#38383a",
  brand: "#79d553",
  onBrand: "#071005",
  positive: "#45d265",
  positiveDeep: "#8be7a2",
  warning: "#ffd60a",
  onWarning: "#3d2f0b",
  warningContent: "#ffd60a",
  negative: "#ff6b6f",
  negativeDeep: "#ff8b91",
  negativeBg: "#4b1114",
  onNegativeBg: "#ffffff",
  negativeTint: "#3d1517",
  cycleTint: "#17202a",
  selectedTint: "rgba(242, 244, 240, 0.16)",
};

/** 재원별 색은 balanceTone으로 읽으며, fg는 칩 bg와 페이지 canvas 양쪽에서 읽혀야 한다.
 * BalancePalette는 두 스킴 모두에 모든 재원 키가 있도록 검사한다. */
const lightBalance: BalancePalette = {
  annual: { fg: "#1f5e10", bg: "#d8f3c4" },
  award: { fg: "#8a4b00", bg: "#ffe8c7" },
  compensation: { fg: "#4c2c9c", bg: "#e6ddff" },
  consolation: { fg: "#9c1d55", bg: "#ffdcea" },
  petition: { fg: "#0b5c55", bg: "#c9efeb" },
  sick: { fg: "#a72027", bg: "#ffdcdd" },
  regular_overnight: { fg: "#12439c", bg: "#d8e6ff" },
  other_overnight: { fg: "#065b7a", bg: "#cdeaf6" },
  outing: { fg: "#454745", bg: "#e4e7e2" },
  weekend_outing: { fg: "#3f4668", bg: "#e0e3f0" },
  other: { fg: "#5a5c59", bg: "#eceee9" },
};

/** 달력 범례의 뜻이 유지되도록 스킴 간 색조를 유지하고 명도만 바꾼다. */
const darkBalance: BalancePalette = {
  annual: { fg: "#b7e79a", bg: "#1e3311" },
  award: { fg: "#ffcf94", bg: "#40270a" },
  compensation: { fg: "#cdbcff", bg: "#2b2350" },
  consolation: { fg: "#ffb3ce", bg: "#47142c" },
  petition: { fg: "#96ded6", bg: "#0d332f" },
  sick: { fg: "#ffadb0", bg: "#451417" },
  regular_overnight: { fg: "#a9c7ff", bg: "#16294d" },
  other_overnight: { fg: "#9dd6ec", bg: "#0d2f3d" },
  outing: { fg: "#c9ccc6", bg: "#2c2e2b" },
  weekend_outing: { fg: "#b6bddc", bg: "#22273d" },
  other: { fg: "#b9bcb6", bg: "#262825" },
};

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
  balance: BalancePalette;
};

const themes: Record<ColorScheme, Theme> = {
  light: { scheme: "light", colors: lightColors, balance: lightBalance },
  dark: { scheme: "dark", colors: darkColors, balance: darkBalance },
};

/** 라우터 밖의 오류 화면도 테마를 읽도록 별도 provider 없이 시스템 스킴을 구독한다.
 * null과 unspecified는 라이트로 처리한다. */
export function useAppColorScheme(): ColorScheme {
  return useColorScheme() === "dark" ? "dark" : "light";
}

export function useTheme(): Theme {
  return themes[useAppColorScheme()];
}

export function useColors(): Palette {
  return themes[useAppColorScheme()].colors;
}

export function useBalanceColors(): BalancePalette {
  return themes[useAppColorScheme()].balance;
}

// RN의 StyleSheet.NamedStyles와 같은 모양. 아래 makeStyles가 StyleSheet.create의
// 시그니처를 그대로 흉내내야 styles.x 타입이 지금과 똑같이 유지된다.
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };
// RN의 StyleSheet.create와 동일한 오타 검출 트릭. 인덱스 시그니처를 얻으려고
// any를 쓰는 자리라 unknown으로는 대체되지 않는다.
type AnyNamedStyles = NamedStyles<Record<string, unknown>>;

/** 렌더 중 부수효과와 참조 변화를 피하도록 스킴별 스타일을 모듈 로드 시 한 번 만든다.
 * StyleSheet.create와 같은 문맥 타입을 유지하며, 반환 훅은 early return 전에 호출한다. */
export function makeStyles<T extends NamedStyles<T> | AnyNamedStyles>(
  factory: (theme: Theme) => T & AnyNamedStyles,
): () => T {
  const sheets: Record<ColorScheme, T> = {
    light: StyleSheet.create(factory(themes.light)),
    dark: StyleSheet.create(factory(themes.dark)),
  };
  return function useStyles(): T {
    return sheets[useAppColorScheme()];
  };
}

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

/** 읽는 폼은 줄 길이를 제한하고, 비교하는 워크스페이스는 화면 폭을 활용한다. */
export const layout = {
  /** 산문·긴 목록: iPad 가로에서 읽기 거리가 지나치게 길어지지 않게 한다. */
  readableContent: 760,
  /** 입력 폼 한 벌: 넓은 창의 시트·전체화면 폼에서 필드가 늘어지지 않게 한다. */
  formContent: 560,
  /** 워크스페이스(달력·대시보드)의 상한. 이보다 넓어지면 가운데로 모은다. */
  workspaceContent: 1600,
  /** 보조 패널(선택 대상 상세)의 폭. 크기 클래스별로 다르다. */
  inspector: { medium: 320, expanded: 380 },
  /** 요약·목차 성격의 사이드 컬럼 폭. */
  sideColumn: { medium: 288, expanded: 320 },
} as const;

/** 기기 종류가 아닌 현재 창 폭으로 분류하며, RN 없는 모듈에서 경계를 검사한다. */
export { breakpoints } from "./window-size-class";

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

export const motion = {
  pressScale: 0.97,
  quick: 150,
  standard: 220,
} as const;
