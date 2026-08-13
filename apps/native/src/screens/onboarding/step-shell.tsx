/**
 * 온보딩 질문 화면의 공통 껍데기 (네이티브).
 *
 * 사용처: `screens/onboarding/*`.
 *
 * 웹의 `pages/onboarding/StepShell.tsx`와 짝이다. 문구는 `ONBOARDING_COPY`에서
 * 오고, 단계마다 달라져야 하는 곳만 props로 덮어쓴다.
 *
 * 제목에 `accessibilityLiveRegion`을 걸어, 단계가 바뀔 때 스크린리더가 새 질문을
 * 읽게 한다(웹은 제목으로 포커스를 옮겨 같은 일을 한다).
 */

import { ONBOARDING_COPY, type OnboardingStepId } from "@leave/shared";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInRight } from "react-native-reanimated";
import { Button } from "@/components/button";
import { makeStyles, spacing } from "@/theme";

export function StepShell(props: {
  step: OnboardingStepId;
  title?: string;
  lead?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  const copy = ONBOARDING_COPY[props.step];
  return (
    <Animated.View
      // key가 단계마다 바뀌므로(부모가 지정) 새 질문이 오른쪽에서 밀려 들어온다.
      entering={SlideInRight.duration(320)}
      exiting={FadeOut.duration(140)}
      style={styles.panel}
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
      >
        {props.title ?? copy.title}
      </Text>
      <Text style={styles.lead}>{props.lead ?? copy.lead}</Text>
      <View style={styles.body}>{props.children}</View>
    </Animated.View>
  );
}

/** 단계 하단의 주 행동. 모든 단계에서 같은 자리·같은 모양이어야 한다. */
export function StepNext(props: {
  label?: string;
  disabled?: boolean;
  pending?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Button
      title={props.label ?? "다음"}
      disabled={props.disabled}
      loading={props.pending}
      onPress={props.onPress}
      testID={props.testID ?? "onboarding-next"}
    />
  );
}

/** "나중에 하기"류의 부차 행동. */
export function StepSkip(props: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Button
      title={props.label}
      variant="ghost"
      onPress={props.onPress}
      testID={props.testID}
    />
  );
}

export function StepError(props: { message: string | null }) {
  const styles = useStyles();
  if (!props.message) return null;
  return (
    <Animated.Text
      entering={FadeIn.duration(160)}
      style={styles.error}
      accessibilityLiveRegion="assertive"
    >
      {props.message}
    </Animated.Text>
  );
}

/** 큰 선택 카드 한 장. 군종·계급·그룹 선택이 같은 모양을 쓴다. */
export function StepNote(props: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.note}>{props.children}</Text>;
}

const useStyles = makeStyles(({ colors }) => ({
  panel: { gap: spacing.md },
  title: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 38,
    color: colors.ink,
  },
  lead: { fontSize: 16, lineHeight: 24, color: colors.body },
  body: { gap: spacing.lg, marginTop: spacing.sm },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  note: { fontSize: 13, lineHeight: 20, color: colors.mute },
}));
