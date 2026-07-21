import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/theme";

type Kind = "positive" | "negative" | "neutral";

export function Badge(props: { text: string; kind?: Kind }) {
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

const styles = StyleSheet.create({
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
});
