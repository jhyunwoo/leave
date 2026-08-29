/**
 * 다음 휴가까지 남은 날(D-day) 카드.
 * 사용처: 내 휴가 탭 맨 위. 눌러서 그 휴가 상세로 간다.
 *
 * 계산은 하지 않는다 — 어떤 휴가를 세는지는 `nextLeaveCountdown`(@leave/client)이 정한다.
 */

import { fmtRange } from "@leave/shared/calendar";
import { Pressable, Text, View } from "react-native";
import type { NextLeaveCountdown } from "@leave/client";
import { makeStyles, radius, spacing } from "@/theme";

export function NextLeaveCard(props: {
  countdown: NextLeaveCountdown;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { leave, phase, days } = props.countdown;
  const onLeave = phase === "onLeave";
  /** 종료일 당일. D-0은 "0일 남았다"로 읽히므로 D-DAY로 바꿔 쓴다. */
  const lastDay = onLeave && days === 0;
  const range = fmtRange(leave.startDate, leave.endDate);

  // 스크린리더가 "D-12"를 읽으면 뜻이 사라진다. 눈으로 읽는 표기와 따로 풀어 쓴다.
  const spokenCount = lastDay
    ? "오늘이 마지막 날이에요"
    : onLeave
      ? `종료까지 ${days}일 남았어요`
      : `${days}일 남았어요`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${onLeave ? "휴가 중이에요" : "다음 휴가"}. ${spokenCount}. ${leave.title}, ${range}. 자세히 보기`}
      onPress={props.onPress}
      style={styles.card}
      testID="next-leave-card"
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.eyebrow} selectable>
          {onLeave ? "휴가 중" : "다음 휴가"}
        </Text>
        <Text style={styles.value} selectable>
          {lastDay ? "D-DAY" : `D-${days}`}
        </Text>
        <Text style={styles.caption} numberOfLines={1} selectable>
          {leave.title} · {range}
        </Text>
        {lastDay ? (
          <Text style={styles.hint} selectable>
            오늘이 휴가 마지막 날이에요
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
