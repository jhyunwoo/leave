import { parseISODate, type ISODate } from "@leave/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/theme";

/** 소수점 자릿수. 10자리면 1/10^10 %가 약 0.05ms마다 바뀌어 눈에 띄게 흘러간다. */
const DECIMALS = 10;
/** 20fps. 자릿수가 계속 흐르는 것을 보여주기에 충분하고 배터리 부담은 적다. */
const TICK_MS = 50;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

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

/** 화면이 보이고 앱이 포그라운드일 때만 도는 시계. */
function useTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, TICK_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, [active]);

  return now;
}

/** 복무 진행률 막대 + 실시간으로 흘러가는 퍼센트. */
export function ServiceProgress(props: {
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  /** 오른쪽 아래에 덧붙일 설명(예: "다음 진급 12월 1일"). */
  caption: string;
}) {
  const now = useTicker();
  const progress = serviceProgressAt(props.enlistedAt, props.dischargeAt, now);
  const percent = progress * 100;

  return (
    <View style={styles.root}>
      <Text
        style={styles.percent}
        accessibilityLabel={`복무 ${percent.toFixed(1)}%`}
      >
        복무 {percent.toFixed(DECIMALS)}%
      </Text>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
      >
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.caption}>{props.caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  percent: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    // 자릿수가 바뀔 때 글자가 흔들리지 않도록 고정폭 숫자.
    fontVariant: ["tabular-nums"],
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
  caption: { fontSize: 12, color: colors.mute },
});
