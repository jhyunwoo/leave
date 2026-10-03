/**
 * 사용법 단계 (네이티브) — 기능마다 한 장씩 넘기는 모션 그래픽 투어.
 *
 * 사용처: `screens/onboarding/index.tsx`. 그림(`TourStage`)은 위쪽 히어로 자리에
 * 뜨고, 이 패널은 같은 장면을 글로 말한다. 몇 번째 장면인지는 부모가 들고 있다 —
 * 무대와 패널이 같은 값을 봐야 하고, 상단 "뒤로"가 장면부터 되돌려야 하기 때문이다.
 *
 * 웹의 `pages/onboarding/HowtoStep.tsx`와 짝이다. 장면 데이터는
 * `ONBOARDING_TOUR` 한 벌이라 두 화면이 갈라질 수 없다.
 *
 * 지금 탭 아래 막대가 장면 한 바퀴 길이로 차올라, 그림이 어디쯤 돌고 있는지와
 * 다음 장면이 있다는 것이 함께 보인다.
 */

import { ONBOARDING_COPY, ONBOARDING_TOUR } from "@leave/shared";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Button } from "@/components/button";
import { makeStyles, radius, spacing, useColors } from "@/theme";

/** 지금 탭 아래에서 장면 한 바퀴 길이로 차오르는 막대. */
function LoopBar(props: { duration: number }) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: props.duration, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [props.duration, reduced, progress]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));
  return <Animated.View style={[styles.loopBar, animated]} />;
}

export function HowtoStep(props: {
  index: number;
  onIndexChange: (index: number) => void;
  onNext: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const last = ONBOARDING_TOUR.length - 1;
  const index = Math.min(Math.max(props.index, 0), last);
  const scene = ONBOARDING_TOUR[index] ?? ONBOARDING_TOUR[0];
  if (!scene) return null;

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>
        {ONBOARDING_COPY.howto.title}
        <Text style={styles.eyebrowCount}>
          {"  "}
          {index + 1} / {ONBOARDING_TOUR.length}
        </Text>
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabsScroller}
        accessibilityRole="tablist"
      >
        {ONBOARDING_TOUR.map((item, i) => {
          const now = i === index;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              aria-selected={now}
              onPress={() => props.onIndexChange(i)}
              style={[
                styles.tab,
                i < index && styles.tabSeen,
                now && styles.tabNow,
              ]}
              testID={`onboarding-tour-tab-${item.id}`}
            >
              <Text
                style={[
                  styles.tabLabel,
                  i < index && styles.tabLabelSeen,
                  now && styles.tabLabelNow,
                ]}
              >
                {item.label}
              </Text>
              {now ? <LoopBar duration={item.duration} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Animated.View
        key={scene.id}
        entering={FadeIn.duration(280)}
        style={styles.copy}
        testID={`onboarding-tour-scene-${scene.id}`}
      >
        <Text
          style={styles.title}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          {scene.title}
        </Text>
        <Text style={styles.body}>{scene.body}</Text>
        <View style={styles.points}>
          {scene.points.map((point) => (
            <View key={point} style={styles.point}>
              <Svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.brand}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={styles.pointIcon}
              >
                <Path d="M5 12.5l4.5 4.5L19 7.5" />
              </Svg>
              <Text style={styles.pointText}>{point}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* 이전 장면은 상단 "뒤로"·탭·쓸기로 간다. 여기에는 앞으로 가는 두 길만 둔다. */}
      <View style={styles.actions}>
        {index < last ? (
          <Button
            title="건너뛰기"
            variant="secondary"
            onPress={props.onNext}
            testID="onboarding-tour-skip"
          />
        ) : null}
        <Button
          icon="right"
          title={index < last ? "다음 기능" : "다 봤어요"}
          flexible
          style={styles.next}
          onPress={() =>
            index < last ? props.onIndexChange(index + 1) : props.onNext()
          }
          testID="onboarding-next"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  panel: { gap: spacing.md },
  eyebrow: { fontSize: 13, fontWeight: "800", color: colors.brand },
  eyebrowCount: { fontWeight: "600", color: colors.mute },
  tabsScroller: { marginHorizontal: -spacing.xl, flexGrow: 0 },
  tabs: { gap: 6, paddingHorizontal: spacing.xl },
  tab: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.pill,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  tabSeen: {
    backgroundColor: colors.primaryPale,
    borderColor: colors.primaryNeutral,
  },
  tabNow: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabLabel: { fontSize: 13, fontWeight: "700", color: colors.mute },
  tabLabelSeen: { color: colors.ink },
  tabLabelNow: { color: colors.canvas },
  loopBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: colors.primary,
    transformOrigin: "left center",
  },
  copy: { gap: spacing.md, marginTop: spacing.xs },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 35,
    color: colors.ink,
  },
  body: { fontSize: 16, lineHeight: 24, color: colors.body },
  points: { gap: spacing.sm },
  point: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  pointIcon: { marginTop: 2 },
  pointText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.body },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  next: { flex: 1 },
}));
