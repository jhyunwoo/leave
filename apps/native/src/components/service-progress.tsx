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
 * (전체 화면 `screens/service-progress-detail.tsx`는 레이아웃 없는 scaleX로 매 프레임
 * 갱신하고, 그 대신 확대 막대를 따로 둔다.)
 *
 * 화면이 앞에 있고 앱이 포그라운드일 때만 시계와 프레임 콜백이 돈다.
 */

import { kstMidnight, type ISODate } from "@leave/shared/dates";
import { serviceProgressAt } from "@leave/shared/rank";
import { Text, TextInput, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useReducedMotion,
} from "react-native-reanimated";
import {
  useActiveGate,
  useServicePercentClock,
  useServiceTicker,
} from "@/lib/service-progress-clock";
import { SERVICE_PERCENT_DECIMALS } from "@/lib/service-progress-format";
import { makeStyles, radius, spacing } from "@/theme";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function formatPercent(percent: number): string {
  "worklet";
  return `복무 ${percent.toFixed(SERVICE_PERCENT_DECIMALS)}%`;
}

/**
 * 프레임마다 흐르는 퍼센트 글자. 이 부품이 마운트되어 있는 동안에만 프레임
 * 콜백이 존재한다 — "동작 줄이기"에서는 아예 그리지 않으므로 워클릿도, 매 프레임
 * 네이티브 텍스트 갱신도 생기지 않는다.
 */
function LivePercentReadout(props: {
  start: number;
  span: number;
  active: boolean;
  initialNow: number;
  style: TextInput["props"]["style"];
}) {
  const percent = useServicePercentClock(
    props.start,
    props.span,
    props.active,
    props.initialNow,
  );
  const label = useDerivedValue(() => formatPercent(percent.value));
  const animatedProps = useAnimatedProps(() => ({
    text: label.value,
    defaultValue: label.value,
  }));
  return (
    <AnimatedTextInput
      style={props.style}
      // 첫 페인트 값도 animatedProps가 준다(useAnimatedProps는 updater를 한 번
      // JS에서 돌려 초기 props를 만든다). defaultValue를 따로 주면 둘이 싸운다.
      animatedProps={animatedProps}
      editable={false}
      scrollEnabled={false}
      caretHidden
      selectTextOnFocus={false}
      underlineColorAndroid="transparent"
      // 초당 120번 바뀌는 값을 스크린리더가 읽으면 안 된다. 아래 progressbar가 대신 말한다.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** 복무 진행률 막대와 소수점 열 자리 퍼센트. */
export function ServiceProgress(props: {
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  /** 전역까지 남은 일수. 서버가 계산한 값을 그대로 받아 위쪽 D-day와 어긋나지 않게 한다. */
  daysLeft: number;
  /**
   * 남은 일과일(평일 − 부대 휴일 · 공휴일 · 개인 휴가). 별도 요청이라 아직
   * 도착하지 않았으면 null이고, 그 동안에는 전역일수만 보인다.
   */
  dutyDays: number | null;
  /** 오른쪽 아래에 덧붙일 설명(예: "다음 진급 12월 1일"). */
  caption: string;
}) {
  const styles = useStyles();
  const focused = useActiveGate();
  /**
   * "동작 줄이기"가 켜져 있으면 프레임 시계를 아예 돌리지 않는다.
   *
   * 이 표시는 초당 120번 글자가 흐르는 게 전부인 장식이다. 접근성 설정에서 동작을
   * 줄여 달라고 한 사용자에게 정확히 그 반대를 하는 것이고, 저사양 기기에서는
   * 프로필 화면에 머무는 내내 매 프레임 워클릿 + 네이티브 텍스트 갱신을 UI
   * 스레드에 얹는다.
   *
   * 끈다고 정보가 사라지지는 않는다. 아래 `percent`(분 단위 갱신)가 그대로 남아
   * 같은 문장을 같은 자리에 쓴다 — 소수 자릿수만 조용해진다.
   */
  const reducedMotion = useReducedMotion();
  const now = useServiceTicker(focused);

  const start = kstMidnight(props.enlistedAt);
  const end = kstMidnight(props.dischargeAt);
  const span = end > start ? end - start : 0;
  const live = focused && span > 0 && now > start && now < end;

  // 막대와 스크린리더가 읽는 값. 분 단위라 숫자가 초당 120번 읽히는 일이 없다.
  const percent =
    serviceProgressAt(props.enlistedAt, props.dischargeAt, now) * 100;

  return (
    <View style={styles.root}>
      {reducedMotion ? (
        // 흐르지 않는 판. 자릿수를 줄여 "멈춘 소수점 열 자리"라는 이상한 그림이
        // 되지 않게 하고, 나머지는 그대로 둔다.
        <Text
          style={styles.percent}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          복무 {percent.toFixed(1)}%
        </Text>
      ) : (
        <LivePercentReadout
          start={start}
          span={span}
          active={live}
          initialNow={now}
          style={styles.percent}
        />
      )}
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
          {props.dutyDays === null ? "" : ` · 일과 ${props.dutyDays}일`}
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
    pointerEvents: "none",
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
    // 일과일이 붙으면 이 줄이 길어진다. 좁은 기기에서 오른쪽 설명을 밀어내지
    // 않도록 둘 다 줄어들 수 있게 둔다.
    flexShrink: 1,
  },
  caption: {
    fontSize: 12,
    color: colors.mute,
    flexShrink: 1,
    textAlign: "right",
  },
}));
