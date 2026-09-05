/**
 * 사용법 단계 (네이티브) — 온보딩에서 유일하게 질문하지 않는 화면.
 *
 * 사용처: `screens/onboarding/index.tsx`.
 *
 * 웹의 `pages/onboarding/HowtoStep.tsx`와 짝이다. 문구는 `ONBOARDING_HOWTO`에서
 * 그대로 오므로 두 화면이 갈라질 수 없다.
 *
 * 카드마다 상자를 두르지 않고 왼쪽 선 하나로 나눈다 — 상자가 다섯 개 겹치면
 * 목록이 아니라 벽으로 읽힌다(웹의 `.ob-howto`와 같은 판단이다).
 */

import { ONBOARDING_HOWTO } from "@leave/shared";
import { Text, View } from "react-native";
import { makeStyles, spacing } from "@/theme";
import { StepNext, StepShell } from "./step-shell";

export function HowtoStep(props: { onNext: () => void }) {
  const styles = useStyles();
  return (
    <StepShell step="howto">
      <View style={styles.list}>
        {ONBOARDING_HOWTO.map((card) => (
          <View key={card.id} style={styles.card}>
            <Text style={styles.title} selectable>
              {card.title}
            </Text>
            <Text style={styles.body} selectable>
              {card.body}
            </Text>
          </View>
        ))}
      </View>
      <StepNext label="다음" onPress={props.onNext} testID="onboarding-next" />
    </StepShell>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  list: { gap: spacing.md },
  card: {
    gap: 3,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryNeutral,
  },
  title: { fontSize: 15, fontWeight: "700", color: colors.ink },
  body: { fontSize: 13.5, lineHeight: 21, color: colors.body },
}));
