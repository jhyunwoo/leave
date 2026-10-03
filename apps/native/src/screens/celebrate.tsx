/**
 * 복무 기념일 축하 화면(네이티브) — 전역 D-n(600·500·…·10일 전, 하루 전)과 진급.
 *
 * 알림함의 내 기념일 알림이나 기념일 푸시를 누르면 열린다. 기념일은 라우트
 * 파라미터에서 읽고(`parseMilestoneParams`), 이름·복무율·전역일은 지금의 `me`에서
 * 읽는다 — 알림을 며칠 뒤에 열어도 숫자가 오늘 기준으로 맞는다. 문구는 웹과 같은
 * `milestoneCelebration`에서 온다.
 *
 * 색종이는 처음 열 때 한 번 떨어지고, 동작 줄이기를 켠 사람에게는 그리지 않는다.
 */

import { useMe } from "@leave/client";
import {
  milestoneCelebration,
  type ServiceMilestone,
} from "@leave/shared/milestones";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { LiquidGlassSurface } from "@/components/liquid-glass-surface";
import { makeStyles, radius, spacing, useColors } from "@/theme";

const CONFETTI_COUNT = 28;
const CONFETTI_COLORS = ["#9fe870", "#ffd11a", "#347a1f", "#cdffad", "#ffffff"];

/** 조각마다 위치·지연·회전을 인덱스에서 결정적으로 만든다(다시 그려도 튀지 않게). */
const CONFETTI = Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
  left: ((index * 37) % 100) / 100,
  delay: ((index * 7) % 12) * 90,
  duration: 2400 + ((index * 13) % 10) * 120,
  rotate: (index * 47) % 360,
  drift: ((index % 5) - 2) * 18,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length]!,
  wide: index % 3 === 0,
}));

function ConfettiPiece(props: {
  piece: (typeof CONFETTI)[number];
  width: number;
  height: number;
}) {
  const { piece } = props;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, {
        duration: piece.duration,
        easing: Easing.bezier(0.25, 0.6, 0.45, 1),
      }),
    );
  }, [piece.delay, piece.duration, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value > 0.85 ? (1 - progress.value) / 0.15 : 1,
    transform: [
      { translateX: piece.drift * progress.value },
      { translateY: -24 + (props.height + 48) * progress.value },
      { rotate: `${piece.rotate + 540 * progress.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: piece.left * props.width,
          width: piece.wide ? 14 : 8,
          height: piece.wide ? 8 : 14,
          borderRadius: 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

export function CelebrateScreen(props: { milestone: ServiceMilestone }) {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const copy = milestoneCelebration(props.milestone);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/notifications");
  };

  const user = me.data?.user;
  const progress = user ? Math.round(user.serviceProgress * 1000) / 10 : 0;

  return (
    <View style={styles.root}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: insets.bottom + spacing.xl,
          },
        ]}
      >
        <View style={styles.topRow}>
          <LiquidGlassSurface interactive style={styles.closeSurface}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="축하 화면 닫기"
              hitSlop={8}
              onPress={close}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
              testID="celebrate-close"
            >
              <Text style={styles.closeGlyph}>×</Text>
            </Pressable>
          </LiquidGlassSurface>
        </View>

        {!user ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} size="large" />
          </View>
        ) : (
          <Animated.View
            entering={reducedMotion ? undefined : FadeInDown.duration(420)}
            style={styles.card}
            testID="celebrate-screen"
          >
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text
              style={styles.hero}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {copy.hero}
              {copy.heroUnit ? (
                <Text style={styles.heroUnit}>{copy.heroUnit}</Text>
              ) : null}
            </Text>
            <Text selectable style={styles.headline} accessibilityRole="header">
              {user.name}님, {copy.headline}
            </Text>
            <Text selectable style={styles.message}>
              {copy.message}
            </Text>

            <View style={styles.stats}>
              <Stat label="지금 계급" value={user.rankLabel} />
              <Stat label="복무율" value={`${progress.toFixed(1)}%`} />
              {/* D-600이면 해를 넘기므로 연도까지 쓴다. */}
              <Stat
                label="전역일"
                value={user.dischargeAt.replaceAll("-", ".")}
              />
            </View>

            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.min(Math.max(progress, 0), 100)}%` },
                ]}
              />
            </View>

            <View style={styles.actions}>
              <Button
                title="복무율 크게 보기"
                variant="secondary"
                onPress={() => router.replace("/service-progress")}
              />
              <Button title="확인" onPress={close} />
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {!reducedMotion && (
        <View
          pointerEvents="none"
          style={styles.confetti}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {CONFETTI.map((piece, index) => (
            <ConfettiPiece
              key={index}
              piece={piece}
              width={width}
              height={height}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Stat(props: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{props.label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {props.value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  confetti: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  topRow: {
    width: "100%",
    minHeight: 52,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  closeSurface: { width: 48, height: 48, borderRadius: radius.pill },
  closeButton: { flex: 1, alignItems: "center", justifyContent: "center" },
  closeButtonPressed: { opacity: 0.55 },
  closeGlyph: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "300",
    includeFontPadding: false,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    backgroundColor: colors.canvas,
    alignItems: "center",
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  hero: {
    color: colors.inkDeep,
    fontSize: 96,
    fontWeight: "900",
    letterSpacing: -5,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  heroUnit: {
    color: colors.brand,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  headline: {
    marginTop: spacing.sm,
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 30,
    textAlign: "center",
  },
  message: {
    color: colors.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  stats: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  stat: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surfaceCard,
    alignItems: "center",
    gap: 4,
  },
  statLabel: { color: colors.mute, fontSize: 12, fontWeight: "600" },
  statValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  track: {
    alignSelf: "stretch",
    height: 8,
    marginTop: spacing.md,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surfaceStrong,
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  actions: {
    alignSelf: "stretch",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
}));
