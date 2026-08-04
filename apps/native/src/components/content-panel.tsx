import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme";

type ContentPanelTone = "plain" | "grouped" | "accent" | "danger";

/**
 * 콘텐츠 계층의 표준 표면.
 *
 * Liquid Glass는 내비게이션과 떠 있는 조작에만 쓰고, 실제 정보와 폼은 이
 * 표면 위에 둔다. 이렇게 분리하면 글래스 안에 다시 불투명 카드가 겹치는
 * 현상을 막고 플랫폼의 대비·투명도 접근성 설정도 예측 가능하게 유지된다.
 */
export function ContentPanel(props: {
  children: ReactNode;
  tone?: ContentPanelTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const tone = props.tone ?? "plain";
  return (
    <View
      style={[styles.base, styles[tone], props.style]}
      testID={props.testID}
    >
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    borderCurve: "continuous",
  },
  plain: { backgroundColor: colors.canvas },
  grouped: { backgroundColor: colors.surfaceCard },
  accent: { backgroundColor: colors.primaryPale },
  danger: { backgroundColor: colors.negativeTint },
});
