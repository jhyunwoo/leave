/**
 * 출타 상태가 보이는 모든 화면에 붙는 고지.
 * 웹의 `OfficialDisclaimer.tsx`와 문구를 똑같이 유지해야 스토어 심사와
 * 이용약관에서 말하는 서비스 성격이 화면마다 어긋나지 않는다.
 */

import { StyleSheet, Text, View } from "react-native";
import { makeStyles, radius, spacing } from "@/theme";

const FULL_NOTICE =
  "출타 상태는 이용자가 입력한 계획과 관리자가 정한 참고 기준으로 계산한 추정치입니다. 공식 기록·승인과 무관하며 실제 휴가는 지휘관 승인과 소속 부대 지침을 따라야 합니다.";

export function OfficialDisclaimer(props: { compact?: boolean }) {
  const styles = useStyles();
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

const useStyles = makeStyles(({ colors }) => ({
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
}));
