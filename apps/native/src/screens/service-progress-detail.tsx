/**
 * 전체 화면 복무율(네이티브).
 *
 * 전체 복무 위치를 모바일 화면에 맞는 세로 막대 하나로 보여준다. 막대의 채움과
 * 내부 퍼센트는 같은 Reanimated shared value에서 파생하므로, React state를
 * 프레임마다 바꾸지 않고 UI 스레드에서 실제 시간에 맞춰 함께 증가한다.
 *
 * 막대 높이는 숫자로 계산하지 않는다. 기기·안전영역마다 어긋나므로 안전영역 안에
 * 남는 세로 공간을 flex로 전부 차지하게 두고, 남은 전역일은 그 옆(막대 오른쪽)
 * 칸에서 세로 가운데에 선다.
 */

import { useMe } from "@leave/client";
import { kstMidnight, type ISODate } from "@leave/shared/dates";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  type SharedValue,
} from "react-native-reanimated";
import { Button } from "@/components/button";
import { LiquidGlassSurface } from "@/components/liquid-glass-surface";
import {
  useActiveGate,
  useServicePercentClock,
  useServiceTicker,
} from "@/lib/service-progress-clock";
import {
  HERO_HEAD_DECIMALS,
  percentBetween,
  SERVICE_PERCENT_DECIMALS,
  splitPercentText,
} from "@/lib/service-progress-format";
import { makeStyles, motion, radius, spacing, useColors } from "@/theme";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const TAP_MESSAGE_MS = 3_000;

function percentTextParts(percent: number): { head: string; tail: string } {
  "worklet";
  const fixed = percent.toFixed(SERVICE_PERCENT_DECIMALS);
  return splitPercentText(fixed, HERO_HEAD_DECIMALS);
}

function AnimatedReadout(props: {
  percent: SharedValue<number>;
  headStyle: TextInput["props"]["style"];
  tailStyle: TextInput["props"]["style"];
}) {
  const parts = useDerivedValue(() => percentTextParts(props.percent.value));
  const headProps = useAnimatedProps(() => ({
    text: parts.value.head,
    defaultValue: parts.value.head,
  }));
  const tailProps = useAnimatedProps(() => ({
    text: `${parts.value.tail}%`,
    defaultValue: `${parts.value.tail}%`,
  }));

  return (
    <View
      style={styles.valueStack}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AnimatedTextInput
        animatedProps={headProps}
        style={props.headStyle}
        editable={false}
        scrollEnabled={false}
        caretHidden
        selectTextOnFocus={false}
        underlineColorAndroid="transparent"
        aria-hidden
        focusable={false}
      />
      <AnimatedTextInput
        animatedProps={tailProps}
        style={props.tailStyle}
        editable={false}
        scrollEnabled={false}
        caretHidden
        selectTextOnFocus={false}
        underlineColorAndroid="transparent"
        aria-hidden
        focusable={false}
      />
    </View>
  );
}

function StaticReadout(props: {
  percent: number;
  headStyle: TextInput["props"]["style"];
  tailStyle: TextInput["props"]["style"];
}) {
  const parts = percentTextParts(props.percent);
  return (
    <View
      style={styles.valueStack}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={props.headStyle}>{parts.head}</Text>
      <Text style={props.tailStyle}>{parts.tail}%</Text>
    </View>
  );
}

function LiveVerticalFill(props: { percent: SharedValue<number> }) {
  const screenStyles = useStyles();
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleY: props.percent.value / 100 }],
  }));

  return (
    <Animated.View
      style={[styles.verticalFill, screenStyles.verticalFill, fill]}
    />
  );
}

function StaticVerticalFill(props: { percent: number }) {
  const screenStyles = useStyles();
  return (
    <View
      style={[
        styles.verticalFill,
        screenStyles.verticalFill,
        { transform: [{ scaleY: props.percent / 100 }] },
      ]}
    />
  );
}

function ProgressContent(props: {
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  daysLeft: number;
}) {
  const screenStyles = useStyles();
  const { width, height } = useWindowDimensions();
  const focused = useActiveGate();
  const reducedMotion = useReducedMotion();
  const now = useServiceTicker(focused);
  const start = kstMidnight(props.enlistedAt);
  const end = kstMidnight(props.dischargeAt);
  const span = end > start ? end - start : 0;
  const staticPercent = percentBetween(start, span, now);
  const ticking =
    focused && !reducedMotion && span > 0 && now > start && now < end;
  const percent = useServicePercentClock(start, span, ticking, now);
  const landscape = width > height;
  const [showTapMessage, setShowTapMessage] = useState(false);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    },
    [],
  );

  // 폭만 정한다. 높이는 barRow가 남는 공간을 그대로 넘겨준다.
  const barWidth = Math.max(
    112,
    Math.min(width * (landscape ? 0.2 : 0.4), landscape ? 168 : 190),
  );
  const headFontSize = Math.max(28, Math.min(barWidth * 0.27, 38));
  const tailFontSize = Math.max(12, Math.min(barWidth * 0.105, 15));
  const valueWidth = barWidth - spacing.lg * 2;
  const headStyle = [
    screenStyles.headValue,
    {
      width: valueWidth,
      fontSize: headFontSize,
      lineHeight: headFontSize * 1.08,
    },
  ];
  const tailStyle = [
    screenStyles.tailValue,
    {
      width: valueWidth,
      fontSize: tailFontSize,
      lineHeight: tailFontSize * 1.35,
    },
  ];
  const finished = staticPercent >= 100;
  const notStarted = now <= start;

  function handleProgressPress() {
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    setShowTapMessage(true);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => {
      setShowTapMessage(false);
      messageTimer.current = null;
    }, TAP_MESSAGE_MS);
  }

  return (
    <View style={[screenStyles.body, landscape && screenStyles.bodyLandscape]}>
      <View style={screenStyles.status}>
        <Text selectable style={screenStyles.eyebrow}>
          복무율
        </Text>
      </View>

      <View style={screenStyles.progressArea}>
        <View style={screenStyles.barRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="전체 복무율"
            accessibilityHint="누르면 복무율에 대한 안내를 보여줍니다"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(staticPercent),
              text: `${staticPercent.toFixed(1)}%`,
            }}
            onPress={handleProgressPress}
            style={({ pressed }) => [
              styles.verticalTrack,
              screenStyles.verticalTrack,
              { width: barWidth },
              pressed &&
                (reducedMotion
                  ? screenStyles.verticalTrackPressedReduced
                  : styles.verticalTrackPressed),
            ]}
            testID="service-progress-main"
          >
            {reducedMotion ? (
              <StaticVerticalFill percent={staticPercent} />
            ) : (
              <LiveVerticalFill percent={percent} />
            )}
            <View style={screenStyles.readoutSurface} pointerEvents="none">
              {reducedMotion ? (
                <StaticReadout
                  percent={staticPercent}
                  headStyle={headStyle}
                  tailStyle={tailStyle}
                />
              ) : (
                <AnimatedReadout
                  percent={percent}
                  headStyle={headStyle}
                  tailStyle={tailStyle}
                />
              )}
            </View>
          </Pressable>

          <View style={screenStyles.daySide}>
            {finished ? (
              <Text selectable style={screenStyles.dayState}>
                복무를 마쳤어요
              </Text>
            ) : notStarted ? (
              <Text selectable style={screenStyles.dayState}>
                입대 전이에요
              </Text>
            ) : (
              <>
                <Text selectable style={screenStyles.dayLabel}>
                  전역까지
                </Text>
                <Text selectable style={screenStyles.dayValue}>
                  {props.daysLeft}
                </Text>
                <Text selectable style={screenStyles.dayUnit}>
                  일
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={screenStyles.messageSlot}>
          {showTapMessage ? (
            <Animated.Text
              entering={
                reducedMotion ? undefined : FadeIn.duration(motion.standard)
              }
              exiting={
                reducedMotion ? undefined : FadeOut.duration(motion.quick)
              }
              selectable
              accessibilityLiveRegion="polite"
              style={screenStyles.tapMessage}
              testID="service-progress-tap-message"
            >
              클릭한다고 복무율이 빠르게 올라가지 않아요
            </Animated.Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function ServiceProgressDetailScreen() {
  const screenStyles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const me = useMe();
  // 막대가 남는 높이를 전부 먹으므로 안전영역을 iOS의 자동 contentInset에
  // 맡길 수 없다. 자동값은 프레임 기준이라 꽉 찬 막대의 아래끝이 홈 인디케이터
  // 밑으로 들어간다. 직접 padding으로 넣어 보이는 영역과 레이아웃을 일치시킨다.
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={screenStyles.root}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[
        screenStyles.content,
        {
          paddingTop: insets.top + spacing.sm,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}
    >
      <View style={screenStyles.topRow}>
        <LiquidGlassSurface interactive style={screenStyles.closeSurface}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="복무율 전체 화면 닫기"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [
              screenStyles.closeButton,
              pressed && screenStyles.closeButtonPressed,
            ]}
            testID="service-progress-close"
          >
            <Text style={screenStyles.closeGlyph}>×</Text>
          </Pressable>
        </LiquidGlassSurface>
      </View>

      {me.isPending ? (
        <View style={screenStyles.center} testID="service-progress-loading">
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : me.isError || !me.data ? (
        <View style={screenStyles.center} testID="service-progress-error">
          <Text selectable style={screenStyles.errorTitle}>
            복무 정보를 불러오지 못했어요
          </Text>
          <Text selectable style={screenStyles.errorBody}>
            프로필로 돌아가 잠시 후 다시 열어주세요.
          </Text>
          <Button title="프로필로 돌아가기" onPress={() => router.back()} />
        </View>
      ) : (
        <ProgressContent
          enlistedAt={me.data.user.enlistedAt as ISODate}
          dischargeAt={me.data.user.dischargeAt as ISODate}
          daysLeft={me.data.user.daysUntilDischarge}
        />
      )}
    </ScrollView>
  );
}

// 정적·애니메이션 막대가 같은 기하를 공유한다. transformOrigin이 아래쪽이라
// scaleY가 0→1로 변해도 채움은 바닥에서 시작해 위로 자란다.
const styles = {
  valueStack: {
    alignItems: "center",
    justifyContent: "center",
  },
  verticalTrack: {
    borderRadius: radius.xl,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  verticalTrackPressed: { transform: [{ scale: motion.pressScale }] },
  verticalFill: {
    position: "absolute",
    inset: 0,
    borderRadius: radius.xl,
    transformOrigin: "center bottom",
  },
} as const;

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    flexGrow: 1,
    minHeight: "100%",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  topRow: {
    width: "100%",
    minHeight: 52,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  closeSurface: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
  },
  closeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: { opacity: 0.55 },
  closeGlyph: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "300",
    includeFontPadding: false,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  errorBody: {
    color: colors.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  body: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  bodyLandscape: {
    flexDirection: "row",
    gap: spacing.xxxl,
  },
  status: {
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  // 세로(열)에서는 alignSelf가 폭을, 가로(행)에서는 높이를 채운다. 두 방향
  // 모두에서 flex:1과 짝지어 "남는 공간 전부"를 막대에 넘긴다.
  progressArea: {
    flex: 1,
    alignSelf: "stretch",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  barRow: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    // stretch라 막대의 높이가 이 행의 높이가 된다. 최소 높이는 두지 않는다 —
    // 조상이 모두 flex:1이라 늘어나지 못하고 넘쳐버린다.
    alignItems: "stretch",
    justifyContent: "center",
    gap: spacing.lg,
  },
  daySide: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  dayLabel: {
    color: colors.body,
    fontSize: 14,
    fontWeight: "700",
  },
  dayValue: {
    color: colors.inkDeep,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  dayUnit: {
    color: colors.body,
    fontSize: 18,
    fontWeight: "700",
  },
  dayState: {
    color: colors.body,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  verticalTrack: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: "0 8px 28px rgba(0, 0, 0, 0.12)",
  },
  verticalTrackPressedReduced: { opacity: 0.72 },
  verticalFill: { backgroundColor: colors.primary },
  readoutSurface: {
    maxWidth: "86%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.canvas,
    boxShadow: "0 2px 12px rgba(0, 0, 0, 0.14)",
  },
  headValue: {
    color: colors.inkDeep,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    padding: 0,
    includeFontPadding: false,
    pointerEvents: "none",
    textAlign: "center",
  },
  tailValue: {
    color: colors.brand,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    padding: 0,
    includeFontPadding: false,
    pointerEvents: "none",
    textAlign: "center",
  },
  messageSlot: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  tapMessage: {
    color: colors.body,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    textAlign: "center",
  },
}));
