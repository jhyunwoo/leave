/**
 * 떠 있는 내비게이션·핵심 조작용 Liquid Glass 표면(iOS 26+).
 * 지원하지 않는 환경에서는 BlurView나 단색으로 자동 대체된다.
 */

import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme";

/**
 * 콘텐츠 위에 떠 있는 내비게이션·핵심 조작 전용 Liquid Glass 표면.
 * 일반 정보 카드와 폼에는 ContentPanel을 사용한다.
 */
export function LiquidGlassSurface(props: {
  children: ReactNode;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const style = [styles.base, props.style];

  if (process.env.EXPO_OS === "ios" && isLiquidGlassAvailable()) {
    return (
      <GlassView
        isInteractive={props.interactive}
        style={style}
        testID={props.testID}
      >
        {props.children}
      </GlassView>
    );
  }

  if (process.env.EXPO_OS === "ios") {
    return (
      <BlurView
        tint="systemMaterial"
        intensity={88}
        style={style}
        testID={props.testID}
      >
        {props.children}
      </BlurView>
    );
  }

  return (
    <View style={[styles.fallback, style]} testID={props.testID}>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    borderCurve: "continuous",
    borderRadius: radius.xl,
  },
  fallback: { backgroundColor: colors.surfaceCard },
});
