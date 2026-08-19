/**
 * 현재 정기외박 주기 안내 배너.
 * 사용처: 달력 화면 상단. 이번 주기에 며칠 남았고 언제 끝나는지 알려준다.
 */

import { fmtDateTiny, fmtRangeTiny } from "@leave/shared/calendar";
import { diffDays, todayInSeoul, type ISODate } from "@leave/shared/dates";
import { type RegularOvernightCycle } from "@leave/shared/regular-overnight";
import type { ReactNode } from "react";
import { Text, View, type ColorValue } from "react-native";
import {
  makeStyles,
  radius,
  spacing,
  useBalanceColors,
  useColors,
} from "@/theme";

/** 네이티브 헤더 아래 글래스 스트립이 높이를 계산할 때 쓰는 배너 높이. */
export const CYCLE_BANNER_HEIGHT = 30;

/**
 * 이번 정기외박 주기 요약. 주기 몫은 다음 적립 전날까지 써야 하고 이월되지 않아서
 * 남은 일수와 마감까지 며칠인지를 달력 맨 위에 붙여둔다.
 */
export function CycleBanner(props: {
  cycle: RegularOvernightCycle;
  usedDays: number;
}) {
  const colors = useColors();
  const balance = useBalanceColors();
  const today = todayInSeoul();
  const remaining = Math.max(props.cycle.grantDays - props.usedDays, 0);
  const daysLeft = Math.max(diffDays(today, props.cycle.end), 0);
  const tone = balance.regular_overnight;
  // 남은 정기외박이 없으면 조용히, 마감이 일주일 안이면 눈에 띄게.
  const urgent = remaining > 0 && daysLeft <= 7;

  return (
    <BannerLine
      // 점은 칩이 아니라 페이지 배경 위에 찍히므로 tone.bg가 아니라 tone.fg를
      // 쓴다. 다크에서 tone.bg는 배경과 거의 같은 명도라 점이 사라진다.
      accent={
        urgent ? colors.warning : remaining > 0 ? tone.fg : colors.surfaceStrong
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
  const colors = useColors();
  const daysLeft = Math.max(diffDays(todayInSeoul(), props.firstGrantDate), 0);
  return (
    <BannerLine accent={colors.surfaceStrong} color={colors.mute}>
      정기외박 첫 적립 {fmtDateTiny(props.firstGrantDate)} · D-{daysLeft} ·
      그전에는 쓸 수 없어요
    </BannerLine>
  );
}

function BannerLine(props: {
  accent: ColorValue;
  color: ColorValue;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <View style={[styles.dot, { backgroundColor: props.accent }]} />
      <Text style={[styles.text, { color: props.color }]} numberOfLines={1}>
        {props.children}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    height: CYCLE_BANNER_HEIGHT - spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  text: { flex: 1, fontSize: 11, fontWeight: "600" },
}));
