/**
 * 상태를 한 단어로 보여주는 작은 배지(긍정/부정/중립).
 * 사용처: 휴가 목록·상세의 계획 상태, 구성원 목록의 역할 표시.
 */

import { Text, View } from "react-native";
import { makeStyles, radius, spacing, useColors } from "@/theme";

type Kind = "positive" | "negative" | "neutral";

export function Badge(props: { text: string; kind?: Kind }) {
  const styles = useStyles();
  const colors = useColors();
  const kind = props.kind ?? "neutral";
  return (
    <View style={[styles.base, styles[kind]]}>
      <Text
        style={[
          styles.label,
          kind === "negative" && { color: colors.negativeDeep },
        ]}
      >
        {props.text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  base: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  positive: { backgroundColor: colors.primaryPale },
  negative: { backgroundColor: colors.negativeTint },
  neutral: { backgroundColor: colors.surfaceCard },
  label: { fontSize: 13, fontWeight: "600", color: colors.inkDeep },
}));
