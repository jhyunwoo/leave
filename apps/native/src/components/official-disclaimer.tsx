import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/theme";

const FULL_NOTICE =
  "출타 상태는 이용자가 입력한 계획과 관리자가 정한 참고 기준으로 계산한 추정치입니다. 공식 기록·승인과 무관하며 실제 휴가는 지휘관 승인과 소속 부대 지침을 따라야 합니다.";

export function OfficialDisclaimer(props: { compact?: boolean }) {
  if (props.compact) {
    return (
      <Text
        selectable
        accessibilityRole="text"
        style={styles.compact}
        numberOfLines={1}
      >
        참고용 추정치 · 공식 승인과 무관
      </Text>
    );
  }

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text selectable style={styles.title}>
        비공식 참고용 도구
      </Text>
      <Text selectable style={styles.body}>
        {FULL_NOTICE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  title: { fontSize: 12, fontWeight: "700", color: colors.ink },
  body: { fontSize: 12, lineHeight: 18, color: colors.body },
  compact: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.body,
    textAlign: "center",
  },
});
