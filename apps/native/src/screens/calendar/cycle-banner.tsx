import {
  diffDays,
  fmtDateTiny,
  fmtRangeTiny,
  todayInSeoul,
  type ISODate,
  type RegularOvernightCycle,
} from "@leave/shared";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BALANCE_COLORS, colors, radius, spacing } from "@/theme";

/** 배너 한 줄의 높이. ScreenHeader가 헤더 높이를 계산할 때 쓴다. */
export const CYCLE_BANNER_HEIGHT = 30;

/**
 * 이번 정기외박 주기 요약. 주기 몫은 다음 적립 전날까지 써야 하고 이월되지 않아서
 * 남은 일수와 마감까지 며칠인지를 달력 맨 위에 붙여둔다.
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

  return (
    <BannerLine
      background={
        urgent ? colors.warning : remaining > 0 ? tone.bg : colors.surfaceCard
      }
      color={
        urgent ? colors.warningContent : remaining > 0 ? tone.fg : colors.mute
      }
    >
      정기외박 {props.cycle.index}주기{" "}
      {fmtRangeTiny(props.cycle.start, props.cycle.end)} ·{" "}
      {props.cycle.grantDays}일 중 {props.usedDays}일 사용 · 잔여 {remaining}일
      · 마감 D-{daysLeft}
    </BannerLine>
  );
}

/**
 * 첫 적립 전 대기 구간. 아직 1주기가 시작하지 않아 쓸 수 있는 정기외박이 없으므로
 * 소진 현황 대신 첫 적립일과 남은 날을 보여준다.
 */
export function FirstGrantBanner(props: { firstGrantDate: ISODate }) {
  const daysLeft = Math.max(diffDays(todayInSeoul(), props.firstGrantDate), 0);
  return (
    <BannerLine background={colors.surfaceCard} color={colors.mute}>
      정기외박 첫 적립 {fmtDateTiny(props.firstGrantDate)} · D-{daysLeft} ·
      그전에는 쓸 수 없어요
    </BannerLine>
  );
}

function BannerLine(props: {
  background: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.root, { backgroundColor: props.background }]}>
      <Text style={[styles.text, { color: props.color }]} numberOfLines={1}>
        {props.children}
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
