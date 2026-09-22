/** 친구 카드의 복무율. 프레임 갱신은 UI 스레드에서 처리한다. */
import type { Friend } from "@leave/client";
import { kstMidnight } from "@leave/shared";
import { useEffect } from "react";
import { Text, TextInput, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useServicePercentClock } from "@/lib/service-progress-clock";
import { percentBetween } from "@/lib/service-progress-format";
import { makeStyles, radius, spacing } from "@/theme";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export function FriendServiceProgress({
  friend,
  active,
  now,
}: {
  friend: Friend;
  active: boolean;
  now: number;
}) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const start = kstMidnight(friend.enlistedAt);
  const end = kstMidnight(friend.dischargeAt);
  const span = Math.max(0, end - start);
  const percent = useServicePercentClock(
    start,
    span,
    active && !reducedMotion && span > 0 && now >= start && now < end,
    now,
  );
  const slowPercent = percentBetween(start, span, now);
  const reveal = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    reveal.value = active ? withTiming(1, { duration: 650 }) : 0;
  }, [active, reveal]);
  // 다섯 자리 값이 바뀔 때만 텍스트 prop을 전달한다.
  const label = useDerivedValue(() => `복무율 ${percent.value.toFixed(5)}%`);
  const animatedProps = useAnimatedProps(() => ({
    text: label.value,
    defaultValue: label.value,
  }));
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: (percent.value / 100) * reveal.value }],
  }));

  return (
    <View style={styles.root}>
      <View style={styles.meta}>
        {reducedMotion ? (
          <Text style={styles.percent}>복무율 {slowPercent.toFixed(5)}%</Text>
        ) : (
          <AnimatedTextInput
            style={styles.percent}
            animatedProps={animatedProps}
            editable={false}
            scrollEnabled={false}
            caretHidden
            underlineColorAndroid="transparent"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        )}
        <Text style={styles.days}>남은 일과일 {friend.dutyDays}일</Text>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={`${friend.name} 복무율`}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: slowPercent,
          text: `${slowPercent.toFixed(5)}%`,
        }}
      >
        {reducedMotion ? (
          <View
            style={[
              styles.fill,
              { transform: [{ scaleX: slowPercent / 100 }] },
            ]}
          />
        ) : (
          <Animated.View style={[styles.fill, fill]} />
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: spacing.sm, width: "100%" },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  percent: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
    padding: 0,
    includeFontPadding: false,
    pointerEvents: "none",
  },
  days: { fontSize: 12, color: colors.mute, fontVariant: ["tabular-nums"] },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    transformOrigin: "left center",
  },
}));
