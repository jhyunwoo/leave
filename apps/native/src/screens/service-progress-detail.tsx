/**
 * 전체 화면 복무율(네이티브).
 *
 * 프로필 카드의 작은 막대는 전체 복무 위치를 읽는 데 알맞지만, 실제 증가량은
 * 120Hz 화면에서도 한 프레임에 1픽셀의 수억 분의 일뿐이라 눈에는 멈춰 보인다.
 * 이 화면은 같은 퍼센트로 전체 막대와 소수점 5번째 자리 확대 막대를 함께 그린다.
 * 확대 막대가 과장된 별도 수치로 오해되지 않도록 자리와 반복 주기를 바로 적는다.
 *
 * 숫자와 두 막대는 하나의 Reanimated shared value에서 파생한다. React state를
 * 프레임마다 바꾸지 않고 UI 스레드에서 TextInput의 text와 transform만 갱신한다.
 */

import { useMe } from "@leave/client";
import { kstMidnight, type ISODate } from "@leave/shared/dates";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
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
  ZOOM_DECIMAL_PLACE,
  zoomFraction,
  zoomSweepSeconds,
} from "@/lib/service-progress-format";
import { makeStyles, radius, spacing, useColors } from "@/theme";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function percentTextParts(percent: number): {
  head: string;
  tail: string;
} {
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
      style={styles.valueRow}
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
    <View style={styles.valueRow}>
      <Text selectable style={props.headStyle}>
        {parts.head}
      </Text>
      <Text selectable style={props.tailStyle}>
        {parts.tail}%
      </Text>
    </View>
  );
}

function LiveMainBar(props: { percent: SharedValue<number> }) {
  const screenStyles = useStyles();
  const mainFill = useAnimatedStyle(() => ({
    transform: [{ scaleX: props.percent.value / 100 }],
  }));

  return (
    <View style={[styles.mainTrack, screenStyles.mainTrack]}>
      <Animated.View
        style={[styles.mainFill, screenStyles.mainFill, mainFill]}
      />
    </View>
  );
}

function LiveZoomBar(props: { percent: SharedValue<number> }) {
  const screenStyles = useStyles();
  const zoomFill = useAnimatedStyle(() => ({
    transform: [
      { scaleX: zoomFraction(props.percent.value, ZOOM_DECIMAL_PLACE) },
    ],
  }));

  return (
    <View
      style={[styles.zoomTrack, screenStyles.zoomTrack]}
      accessibilityElementsHidden
    >
      <Animated.View
        style={[styles.zoomFill, screenStyles.zoomFill, zoomFill]}
      />
    </View>
  );
}

function StaticMainBar(props: { percent: number }) {
  const screenStyles = useStyles();
  return (
    <View style={[styles.mainTrack, screenStyles.mainTrack]}>
      <View
        style={[
          styles.mainFill,
          screenStyles.mainFill,
          { transform: [{ scaleX: props.percent / 100 }] },
        ]}
      />
    </View>
  );
}

function StaticZoomBar(props: { percent: number }) {
  const screenStyles = useStyles();
  return (
    <View
      style={[styles.zoomTrack, screenStyles.zoomTrack]}
      accessibilityElementsHidden
    >
      <View
        style={[
          styles.zoomFill,
          screenStyles.zoomFill,
          {
            transform: [
              { scaleX: zoomFraction(props.percent, ZOOM_DECIMAL_PLACE) },
            ],
          },
        ]}
      />
    </View>
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

  // 가장 긴 100.00 + 8자리 꼬리 + %가 한 줄에 들어오도록 창 폭·높이에서 같이 제한한다.
  const availableValueWidth = landscape ? width * 0.46 : width - spacing.xl * 2;
  const headFontSize = Math.max(
    48,
    Math.min(
      landscape ? height * 0.2 : width * 0.18,
      availableValueWidth / 5.45,
      112,
    ),
  );
  const tailFontSize = Math.max(16, Math.min(headFontSize * 0.28, 30));
  const headStyle = [
    screenStyles.headValue,
    {
      width: headFontSize * 3.75,
      fontSize: headFontSize,
      lineHeight: headFontSize * 1.05,
    },
  ];
  const tailStyle = [
    screenStyles.tailValue,
    {
      width: tailFontSize * 5.7,
      fontSize: tailFontSize,
      lineHeight: headFontSize * 0.82,
    },
  ];
  const sweep = zoomSweepSeconds(span, ZOOM_DECIMAL_PLACE);
  const finished = staticPercent >= 100;
  const notStarted = now <= start;

  return (
    <View style={[screenStyles.body, landscape && screenStyles.bodyLandscape]}>
      <View style={screenStyles.hero}>
        <Text selectable style={screenStyles.eyebrow}>
          복무율
        </Text>
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
        <Text selectable style={screenStyles.remaining}>
          {finished
            ? "복무를 마쳤어요"
            : notStarted
              ? "입대 전이에요"
              : `전역까지 ${props.daysLeft}일`}
        </Text>
      </View>

      <View style={screenStyles.progressArea}>
        <View
          style={screenStyles.mainBarGroup}
          accessibilityRole="progressbar"
          accessibilityLabel="전체 복무율"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(staticPercent),
            text: `${staticPercent.toFixed(1)}%`,
          }}
          testID="service-progress-main"
        >
          <View style={screenStyles.barHeading}>
            <Text selectable style={screenStyles.barTitle}>
              전체 복무
            </Text>
            <Text selectable style={screenStyles.barCaption}>
              0% → 100%
            </Text>
          </View>
          {reducedMotion ? (
            <StaticMainBar percent={staticPercent} />
          ) : (
            <LiveMainBar percent={percent} />
          )}
        </View>

        <View style={screenStyles.zoomBarGroup} testID="service-progress-zoom">
          <View style={screenStyles.barHeading}>
            <Text selectable style={screenStyles.barTitle}>
              실시간 확대
            </Text>
            <Text selectable style={screenStyles.barCaption}>
              소수점 {ZOOM_DECIMAL_PLACE}번째 자리
            </Text>
          </View>
          <Text selectable style={screenStyles.zoomDescription}>
            {finished
              ? "전역 시점에서 멈췄어요."
              : notStarted
                ? "입대일부터 움직이기 시작해요."
                : reducedMotion
                  ? "동작 줄이기 설정에 따라 현재 위치에 멈춰 있어요."
                  : `${sweep.toFixed(1)}초마다 한 칸을 실제 속도로 확대해 보여줘요.`}
          </Text>
          {reducedMotion ? (
            <StaticZoomBar percent={staticPercent} />
          ) : (
            <LiveZoomBar percent={percent} />
          )}
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

  return (
    <ScrollView
      style={screenStyles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={screenStyles.content}
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

// 정적·애니메이션 막대가 같은 기하를 공유한다. transformOrigin이 왼쪽이라
// scaleX가 0→1로 변해도 채움의 시작점이 흔들리지 않는다.
const styles = {
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  mainTrack: {
    width: "100%",
    height: 34,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  mainFill: {
    width: "100%",
    height: "100%",
    borderRadius: radius.pill,
    transformOrigin: "left center",
  },
  zoomTrack: {
    width: "100%",
    height: 18,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  zoomFill: {
    width: "100%",
    height: "100%",
    borderRadius: radius.pill,
    transformOrigin: "left center",
  },
} as const;

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    flexGrow: 1,
    minHeight: "100%",
    padding: spacing.lg,
    gap: spacing.md,
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
    justifyContent: "space-evenly",
    gap: spacing.xxxl,
    paddingVertical: spacing.xl,
  },
  bodyLandscape: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.xxxl,
  },
  hero: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headValue: {
    color: colors.inkDeep,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    padding: 0,
    includeFontPadding: false,
    pointerEvents: "none",
    textAlign: "right",
  },
  tailValue: {
    color: colors.brand,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    padding: 0,
    includeFontPadding: false,
    pointerEvents: "none",
    textAlign: "left",
  },
  remaining: {
    color: colors.body,
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  progressArea: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: spacing.xl,
  },
  mainBarGroup: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    backgroundColor: colors.canvas,
  },
  zoomBarGroup: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    backgroundColor: colors.primaryPale,
  },
  barHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  barTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  barCaption: {
    color: colors.body,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  zoomDescription: {
    color: colors.body,
    fontSize: 13,
    lineHeight: 19,
  },
  // 아래 네 색은 정적 styles 객체에 테마값을 넘기는 연결점이다.
  mainTrack: { backgroundColor: colors.hairline },
  mainFill: { backgroundColor: colors.primary },
  zoomTrack: { backgroundColor: colors.surfaceStrong },
  zoomFill: { backgroundColor: colors.brand },
}));
