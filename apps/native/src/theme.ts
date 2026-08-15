/**
 * 네이티브 디자인 토큰 — 색·간격·모서리.
 *
 * 사용처: apps/native/src 의 모든 컴포넌트.
 *
 * 색은 라이트/다크 두 벌을 명시적으로 적고, 훅으로 골라 쓴다. 예전에는
 * PlatformColor/DynamicColorIOS로 시스템에 위임했는데 두 가지가 문제였다.
 *
 *  1) DynamicColorIOS는 iOS에서만 동작한다. 안드로이드·웹은 라이트값만 받아
 *     브랜드색이 다크모드에서 그대로 밝게 남았다.
 *  2) 시스템 색(자동으로 뒤집힘)과 고정 hex(BALANCE_COLORS 등)가 한 화면에
 *     섞이면서 "일부만 뒤집힌" 어색한 다크모드가 됐다.
 *
 * 값이 JS에 있으면 스킴이 바뀔 때 리렌더로 반영되므로, @expo/ui·NativeTabs
 * 같은 네이티브 prop에도 확정된 hex를 그대로 넘길 수 있다.
 *
 * 훅이 아닌 평범한 모듈에서는 색을 읽을 수 없다(React 밖에는 스킴이 없다).
 * 그런 곳은 호출하는 컴포넌트에서 색을 인자로 받아 넘긴다.
 */

import {
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { BalanceKey } from "@leave/shared";

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
};

/**
 * 표면 3단 위계는 두 스킴에서 방향이 뒤집힌다.
 *   라이트: canvasSoft < surfaceCard < canvas   (페이지가 어둡고 카드가 희다)
 *   다크:   canvasSoft < canvas < surfaceCard   (페이지가 검고 카드가 밝다)
 * 예전 값은 iOS에서 canvas와 surfaceCard가 둘 다 #ffffff(라이트), canvas와
 * canvasSoft가 둘 다 #000000(다크)이라 입력창과 카드가 배경에 묻혔다.
 */
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
  mute: "#868685",
  mutedSoft: "#9a9c99",
  canvas: "#ffffff",
  canvasSoft: "#eceee9",
  surfaceCard: "#f2f4f0",
  surfaceStrong: "#d8ddd5",
  hairline: "#d7dbd4",
  brand: "#347a1f",
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
  mute: "#8e918c",
  mutedSoft: "#6d706b",
  canvas: "#1c1c1e",
  canvasSoft: "#000000",
  surfaceCard: "#2c2c2e",
  surfaceStrong: "#3a3a3c",
  hairline: "#38383a",
  brand: "#79d553",
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
};

export type BalanceTone = { readonly fg: string; readonly bg: string };
export type BalancePalette = Readonly<Record<BalanceKey, BalanceTone>>;

/**
 * 휴가 재원별 색. 달력에서 내 휴가가 어떤 재원인지 한눈에 구분하는 용도라
 * 서로 충분히 다른 색조를 쓴다. bg는 칩 배경, fg는 그 위의 글자색.
 *
 * fg는 칩 위에서만 쓰이는 게 아니다 — cycle-banner는 fg를 페이지 배경 위
 * 글자로 직접 쓴다. 그래서 다크 fg는 canvas(#1c1c1e) 위에서도 읽혀야 한다.
 *
 * Record<BalanceKey, _>로 묶어서 한쪽 스킴에서 키가 빠지면 빌드가 깨지게 한다.
 */
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
  other: { fg: "#5a5c59", bg: "#eceee9" },
};

/** 같은 색조를 유지한 채 명도만 뒤집는다 — 달력 범례가 두 스킴에서 같은 뜻을 갖도록. */
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

/**
 * 시스템 색 구성.
 *
 * RN의 useColorScheme은 내부적으로 useSyncExternalStore(Appearance)라
 * tearing 없이 한 번의 렌더로 모든 구독자가 같은 값을 본다. 그래서 별도의
 * Context Provider를 두지 않는다 — index.js가 RootErrorBoundary를 ExpoRoot
 * 위에 올리기 때문에, provider를 쓰면 라우터가 죽었을 때 ErrorScreen이
 * 테마 없이 렌더된다.
 *
 * null·"unspecified"는 라이트로 접는다.
 */
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

/**
 * 스타일시트 팩토리 — StyleSheet.create의 테마 버전.
 *
 * 두 스킴 분량을 모듈 로드 시점에 한 번씩만 만들어 두고, 훅은 그중 하나를
 * 고르기만 한다. 렌더마다 StyleSheet.create가 다시 도는 일이 없고, 반환
 * 객체의 참조가 스킴별로 고정돼 하위 컴포넌트의 memo도 깨지지 않는다.
 * (렌더 중에 캐시를 채우지 않는 것도 중요하다 — React Compiler가 켜져 있어
 * 렌더 단계 부수효과는 피해야 한다.)
 *
 * 시그니처는 StyleSheet.create와 똑같이 맞췄다. 그래야 `fontWeight: "600"`
 * 같은 리터럴이 문맥 타입으로 좁혀져 styles.x 타입이 지금과 동일하게 남는다.
 *
 *   const useStyles = makeStyles(({ colors }) => ({
 *     root: { backgroundColor: colors.canvasSoft },
 *   }));
 *
 *   function Screen() {
 *     const styles = useStyles();   // 훅이므로 early return보다 위에서 부른다
 *   }
 */
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

/**
 * 폭에 관한 토큰.
 *
 * "읽는 콘텐츠"와 "작업하는 콘텐츠"를 구분한다. 산문·폼은 눈이 한 줄을 따라가는
 * 거리가 길어지면 읽기 어려워지므로 최대 폭을 건다. 반대로 달력·대시보드·목록은
 * 폭이 곧 한눈에 보이는 정보량이라 화면을 최대한 쓰되, 초대형 창에서 여백만
 * 늘어나지 않도록 상한만 둔다.
 */
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

/**
 * 창 크기 클래스의 경계(논리 px). 기기가 아니라 **지금 앱이 차지한 창의 폭**을
 * 기준으로 삼는다 — 같은 iPad라도 Split View에서는 좁은 창이고, 폴더블은 한
 * 기기 안에서 두 크기를 오간다.
 *
 * 값은 DESIGN.md의 반응형 표(Mobile <768 / Tablet 768–1023 / Desktop ≥1024)와
 * 맞춘다. 웹과 네이티브가 같은 폭에서 같은 판단을 하도록.
 */
export const breakpoints = { medium: 768, expanded: 1024 } as const;

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
