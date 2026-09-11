/**
 * 다음 휴가·다음 외출까지 남은 날(D-day) 카드.
 * 사용처: 내 휴가 탭 맨 위. 눌러서 그 휴가 상세로 간다.
 *
 * 계산은 하지 않는다 — 어떤 휴가를 세는지는 `nextLeaveCountdowns`(@leave/client)이
 * 정하고, 이 컴포넌트는 갈래(`kind`)에 맞는 문구만 고른다. 카드가 둘인 이유는
 * 그쪽 주석에 있다 — 내일 나가는 외출이 다음 주 연가를 가리면 안 된다.
 */

import { fmtRange } from "@leave/shared/calendar";
import { Pressable, Text, View } from "react-native";
import {
  formatLeaveRemainingTime,
  type NextLeaveCountdown,
} from "@leave/client";
import { makeStyles, radius, spacing } from "@/theme";

/** 갈래마다 다른 것은 문구와 testID뿐이다. 계산은 둘이 같은 함수를 쓴다. */
const KIND_LABELS = {
  leave: {
    onLeave: "휴가 중",
    upcoming: "다음 휴가",
    spokenOnLeave: "휴가 중이에요",
    lastDay: "오늘이 휴가 마지막 날이에요",
    testID: "next-leave-card",
  },
  outing: {
    onLeave: "외출 중",
    upcoming: "다음 외출",
    spokenOnLeave: "외출 중이에요",
    // 외출은 하루짜리라 "외출 중"이면 언제나 마지막 날이다. 같은 말을 두 줄로
    // 늘어놓지 않는다 — 눈에 걸리는 것은 남은 시간이지 이 문장이 아니다.
    lastDay: null,
    testID: "next-outing-card",
  },
} as const;

export function NextLeaveCard(props: {
  countdown: NextLeaveCountdown;
  kind: keyof typeof KIND_LABELS;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { leave, phase, days } = props.countdown;
  const labels = KIND_LABELS[props.kind];
  const onLeave = phase === "onLeave";
  const remaining = formatLeaveRemainingTime(
    props.countdown.remainingSeconds ?? 0,
  );
  /** 종료일 당일이라 알릴 것이 있는가. 외출은 언제나 당일이라 알리지 않는다. */
  const lastDayHint = onLeave && days === 0 ? labels.lastDay : null;
  const range = fmtRange(leave.startDate, leave.endDate);

  // 스크린리더가 "D-12"를 읽으면 뜻이 사라진다. 눈으로 읽는 표기와 따로 풀어 쓴다.
  const spokenCount = onLeave
    ? `복귀까지 ${remaining} 남았어요`
    : `${days}일 남았어요`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${onLeave ? labels.spokenOnLeave : labels.upcoming}. ${spokenCount}. ${leave.title}, ${range}. 자세히 보기`}
      onPress={props.onPress}
      style={styles.card}
      testID={labels.testID}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.eyebrow} selectable>
          {onLeave ? labels.onLeave : labels.upcoming}
        </Text>
        <Text
          style={styles.value}
          numberOfLines={1}
          adjustsFontSizeToFit
          selectable
        >
          {onLeave ? remaining : `D-${days}`}
        </Text>
        <Text style={styles.caption} numberOfLines={1} selectable>
          {leave.title} · {range}
        </Text>
        {lastDayHint ? (
          <Text style={styles.hint} selectable>
            {lastDayHint}
          </Text>
        ) : null}
      </View>
      <Text style={styles.detailLink}>자세히</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  // 바로 아래 보유 휴가 카드가 이미 primaryPale이다. 여기도 옅은 톤을 쓰면 카드
  // 두 장이 한 덩어리로 뭉쳐 보이므로, 표면은 기본 톤으로 두고 숫자만 강조한다.
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  value: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.brand,
    fontVariant: ["tabular-nums"],
    paddingTop: 2,
  },
  caption: { fontSize: 13, color: colors.body, paddingTop: 2 },
  hint: { fontSize: 12, color: colors.mute, paddingTop: 2 },
  detailLink: { fontSize: 13, fontWeight: "700", color: colors.brand },
}));
