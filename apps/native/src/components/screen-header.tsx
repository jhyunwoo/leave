import { BlurView } from "expo-blur";
import type { ReactNode, RefObject } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, type } from "@/theme";

/** 제목 줄 높이. 액션 버튼(size="sm", minHeight 42)이 들어가도 넉넉하다. */
const TITLE_ROW_HEIGHT = 52;
const SUBTITLE_HEIGHT = 20;
const BOTTOM_PADDING = spacing.sm;

function useTopInset() {
  const insets = useSafeAreaInsets();
  return process.env.EXPO_OS === "web" ? spacing.lg : insets.top;
}

/**
 * 헤더가 차지하는 높이. 화면은 이 값을 스크롤 콘텐츠의 paddingTop으로 써서
 * 헤더 아래로 내용이 흘러가게 한다. 측정을 기다리지 않도록 상수로 계산한다.
 */
export function useScreenHeaderHeight(options: {
  subtitle?: boolean;
  belowHeight?: number;
}): number {
  return (
    useTopInset() +
    TITLE_ROW_HEIGHT +
    (options.subtitle ? SUBTITLE_HEIGHT : 0) +
    (options.belowHeight ?? 0) +
    BOTTOM_PADDING
  );
}

/**
 * 네 탭이 공유하는 상단 고정 헤더.
 *
 * 제목 → 설명 → (달력의 요일 행 같은) 추가 영역 순으로 쌓고, 화면 콘텐츠는
 * 반투명 블러 뒤로 스크롤된다. 탭마다 제목 크기·설명 위치·여백이 달랐던 것을
 * 여기 한 곳으로 모았다.
 */
export function ScreenHeader(props: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  below?: ReactNode;
  belowHeight?: number;
  /** 블러가 실제 콘텐츠를 흐리게 하려면 그 레이어의 ref가 필요하다(Android). */
  blurTarget?: RefObject<View | null>;
}) {
  const topInset = useTopInset();
  const height = useScreenHeaderHeight({
    subtitle: props.subtitle != null,
    belowHeight: props.belowHeight,
  });

  return (
    <BlurView
      blurTarget={props.blurTarget}
      blurMethod={
        process.env.EXPO_OS === "android"
          ? "dimezisBlurViewSdk31Plus"
          : undefined
      }
      tint="systemChromeMaterialLight"
      intensity={82}
      style={[styles.root, { height, paddingTop: topInset }]}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>
          {props.title}
        </Text>
        {props.actions && <View style={styles.actions}>{props.actions}</View>}
      </View>
      {props.subtitle != null && (
        <Text style={styles.subtitle} numberOfLines={1}>
          {props.subtitle}
        </Text>
      )}
      {props.below}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingBottom: BOTTOM_PADDING,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(14, 15, 12, 0.14)",
    overflow: "hidden",
  },
  titleRow: {
    height: TITLE_ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
    color: colors.ink,
    ...type.screenTitle,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  subtitle: {
    height: SUBTITLE_HEIGHT,
    paddingHorizontal: spacing.lg,
    color: colors.body,
    ...type.screenSubtitle,
  },
});
