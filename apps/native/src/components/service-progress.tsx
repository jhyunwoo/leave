/**
 * 복무 진행률 표시.
 * 사용처: 프로필 화면. 입대일~전역일 사이 현재 위치를 소수점 열 자리까지 보여준다.
 *
 * 숫자는 UI 스레드에서 매 프레임(최대 120fps) 다시 그린다. 육군 18개월 기준으로
 * 퍼센트 소수점 10번째 자리 한 칸이 약 47μs라, 120fps면 마지막 세 자리가 눈에
 * 보이게 흐른다. 이걸 React 상태로 하면 초당 120번 리렌더가 되므로 Reanimated의
 * shared value에 값을 두고 TextInput의 `text` prop만 갱신한다(Animated.Text는
 * children을 애니메이트하지 못한다는 공식 제약 때문에 TextInput을 쓴다).
 *
 * 반면 막대는 1분에 한 번만 움직인다. 한 프레임 사이 막대가 늘어나는 폭은 1e-9픽셀
 * 수준이라 보이지도 않는데, 매 프레임 width 레이아웃을 다시 도는 건 낭비다.
 *
 * 화면이 앞에 있고 앱이 포그라운드일 때만 시계와 프레임 콜백이 돈다.
 */

import { parseISODate, type ISODate } from "@leave/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Text, TextInput, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { makeStyles, radius, spacing } from "@/theme";

/** 퍼센트 소수 자릿수. 마지막 세 자리가 프레임마다 흐르는 게 이 값의 목적이다. */
const DECIMALS = 10;
/** 요구 상한. 144Hz 안드로이드 기기에서도 이 이상은 그리지 않는다. */
const MAX_FPS = 120;
const DRAW_INTERVAL_MS = 1000 / MAX_FPS;
/** 막대와 접근성 값은 분 단위 갱신으로 충분하며 화면·배터리 노이즈를 만들지 않는다. */
const TICK_MS = 60_000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** 달력 날짜(KST 자정)를 실제 시각으로. parseISODate는 UTC 자정을 준다. */
function kstMidnight(date: ISODate): number {
  return parseISODate(date).getTime() - KST_OFFSET_MS;
}

/**
 * 입대일~전역일 사이 경과 비율(0~1). 서버가 주는 serviceProgress는 하루 단위라
 * 화면에서는 시각 단위로 다시 계산해 실시간으로 올라가는 값을 보여준다.
 */
export function serviceProgressAt(
  enlistedAt: ISODate,
  dischargeAt: ISODate,
  now: number,
): number {
  const start = kstMidnight(enlistedAt);
  const end = kstMidnight(dischargeAt);
  if (!(end > start)) return 0;
  return Math.min(Math.max((now - start) / (end - start), 0), 1);
}

/** 위와 같은 계산의 퍼센트 판. 워클릿에서도 부르므로 순수하게 유지한다. */
function percentBetween(start: number, span: number, now: number): number {
  "worklet";
  if (span <= 0) return 0;
  const ratio = (now - start) / span;
  return (ratio < 0 ? 0 : ratio > 1 ? 1 : ratio) * 100;
}

function formatPercent(percent: number): string {
  "worklet";
  return `복무 ${percent.toFixed(DECIMALS)}%`;
}

/** 화면이 보이고 앱이 포그라운드일 때만 true. 시계와 프레임 콜백이 함께 쓴다. */
function useActiveGate(): boolean {
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(
    () => AppState.currentState === "active",
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
    });
    return () => subscription.remove();
  }, []);

  return focused && foreground;
}

/** 막대와 접근성 값을 위한 저속 시계. */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [active]);

  return now;
}

/**
 * 매 프레임 갱신되는 퍼센트 문자열. UI 스레드에만 존재하므로 리렌더를 만들지 않는다.
 *
 * 시계는 프레임 타임스탬프(iOS CACurrentMediaTime, Android nanoTime)를 쓴다.
 * Date.now()는 1ms 격자라 10번째 자리가 21씩 뭉텅이로 튀는데, 활성화 첫 프레임에
 * 벽시계와 프레임 시계를 한 번 맞춰두면 그 뒤로는 서브밀리초로 흐른다.
 */
function useLivePercentLabel(
  start: number,
  span: number,
  active: boolean,
  initialNow: number,
) {
  const percent = useSharedValue(percentBetween(start, span, initialNow));
  const epochAnchor = useSharedValue(0);
  const frameAnchor = useSharedValue(0);
  const nextDue = useSharedValue(0);

  const frameCallback = useFrameCallback((frame) => {
    "worklet";
    // timeSinceFirstFrame은 활성화될 때마다 0부터 다시 시작한다. 그 첫 프레임에서
    // 벽시계와 프레임 시계를 맞춰두면 백그라운드 동안 벌어진 차이가 흡수된다.
    if (frame.timeSinceFirstFrame === 0) {
      epochAnchor.value = Date.now();
      frameAnchor.value = frame.timestamp;
      nextDue.value = frame.timestamp;
    } else if (frame.timestamp < nextDue.value) {
      return;
    }
    // 다음 차례는 "그린 시각"이 아니라 "예정 시각"에서 더한다. 그래야 144Hz에서
    // 한 프레임씩 거르며 72fps로 반토막 나지 않고 120fps에 붙는다.
    const due = nextDue.value + DRAW_INTERVAL_MS;
    nextDue.value =
      due < frame.timestamp ? frame.timestamp + DRAW_INTERVAL_MS : due;

    const now = epochAnchor.value + (frame.timestamp - frameAnchor.value);
    percent.value = percentBetween(start, span, now);
  }, false);

  useEffect(() => {
    frameCallback.setActive(active);
    return () => frameCallback.setActive(false);
  }, [active, frameCallback]);

  const label = useDerivedValue(() => formatPercent(percent.value));

  return useAnimatedProps(() => ({
    text: label.value,
    defaultValue: label.value,
  }));
}

/** 복무 진행률 막대와 소수점 열 자리 퍼센트. */
export function ServiceProgress(props: {
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  /** 전역까지 남은 일수. 서버가 계산한 값을 그대로 받아 위쪽 D-day와 어긋나지 않게 한다. */
  daysLeft: number;
  /** 오른쪽 아래에 덧붙일 설명(예: "다음 진급 12월 1일"). */
  caption: string;
}) {
  const styles = useStyles();
  const active = useActiveGate();
  const now = useTicker(active);

  const start = kstMidnight(props.enlistedAt);
  const end = kstMidnight(props.dischargeAt);
  const span = end > start ? end - start : 0;

  // 막대와 스크린리더가 읽는 값. 분 단위라 숫자가 초당 120번 읽히는 일이 없다.
  const percent =
    serviceProgressAt(props.enlistedAt, props.dischargeAt, now) * 100;
  const animatedProps = useLivePercentLabel(start, span, active, now);

  return (
    <View style={styles.root}>
      <AnimatedTextInput
        style={styles.percent}
        // 첫 페인트 값도 animatedProps가 준다(useAnimatedProps는 updater를 한 번
        // JS에서 돌려 초기 props를 만든다). defaultValue를 따로 주면 둘이 싸운다.
        animatedProps={animatedProps}
        editable={false}
        scrollEnabled={false}
        caretHidden
        selectTextOnFocus={false}
        underlineColorAndroid="transparent"
        pointerEvents="none"
        // 초당 120번 바뀌는 값을 스크린리더가 읽으면 안 된다. 아래 progressbar가 대신 말한다.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={`복무 ${percent.toFixed(1)}%`}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
      >
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <View style={styles.metaRow}>
        <Text selectable style={styles.days}>
          전역까지 {props.daysLeft}일
        </Text>
        <Text style={styles.caption}>{props.caption}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: spacing.sm },
  percent: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    // 자릿수가 바뀔 때 글자가 흔들리지 않도록 고정폭 숫자.
    fontVariant: ["tabular-nums"],
    // TextInput을 Text처럼 보이게. 안드로이드 기본 여백을 죽인다.
    padding: 0,
    includeFontPadding: false,
  },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  days: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  caption: {
    fontSize: 12,
    color: colors.mute,
    flexShrink: 1,
    textAlign: "right",
  },
}));
