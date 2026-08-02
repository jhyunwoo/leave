import {
  diffDays,
  fmtRangeTiny,
  todayInSeoul,
  type RegularOvernightCycle,
} from "@leave/shared";
import { StyleSheet, Text, View } from "react-native";
import { BALANCE_COLORS, colors, radius, spacing } from "@/theme";

/** 배너 한 줄의 높이. ScreenHeader가 헤더 높이를 계산할 때 쓴다. */
export const CYCLE_BANNER_HEIGHT = 30;

/**
 * 이번 정기외박 주기 요약. 정기외박은 주기 안에 소진해야 해서
 * 남은 일수와 마감까지 며칠인지를 달력 맨 위에 붙여둔다.
 *
 * 1주기는 첫 적립을 기다리는 구간이라 쥔 일수가 없다. 이때는 소진 현황 대신
 * 첫 적립까지 며칠 남았는지를 보여준다.
 */
export function CycleBanner(props: {
  cycle: RegularOvernightCycle;
  usedDays: number;
}) {
  const today = todayInSeoul();
  const remaining = Math.max(props.cycle.grantDays - props.usedDays, 0);
  const daysLeft = Math.max(diffDays(today, props.cycle.end), 0);
  const tone = BALANCE_COLORS.regular_overnight;
  // 남은 정기외박이 없으면 조용히, 마감이 일주일 안이면 눈에 띄게.
  const urgent = remaining > 0 && daysLeft <= 7;
  const awaitingFirstGrant = props.cycle.grantDays === 0;

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: remaining > 0 ? tone.bg : colors.surfaceCard },
        urgent && { backgroundColor: colors.warning },
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: remaining > 0 ? tone.fg : colors.mute },
          urgent && { color: colors.warningContent },
        ]}
        numberOfLines={1}
      >
        정기외박 {props.cycle.index}주기{" "}
        {fmtRangeTiny(props.cycle.start, props.cycle.end)} ·{" "}
        {awaitingFirstGrant ? (
          <>첫 적립까지 D-{daysLeft + 1}</>
        ) : (
          <>
            {props.cycle.grantDays}일 중 {props.usedDays}일 사용 · 잔여{" "}
            {remaining}일 · 마감 D-{daysLeft}
          </>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: CYCLE_BANNER_HEIGHT - spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: 11, fontWeight: "600" },
});
