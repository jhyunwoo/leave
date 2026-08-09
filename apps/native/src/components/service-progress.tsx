/**
 * 복무 진행률 표시.
 * 사용처: 프로필 화면. 입대일~전역일 사이 현재 위치를 소수점 한 자리까지 보여준다.
 * 화면이 앞에 있을 때만 1분마다 갱신해 배터리와 렌더 비용을 아낀다.
 */

import { parseISODate, type ISODate } from "@leave/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { makeStyles, radius, spacing } from "@/theme";

/** 한눈에 읽을 수 있는 정밀도만 유지한다. */
const DECIMALS = 1;
/** 진행률은 분 단위 갱신으로도 충분하며 화면·배터리 노이즈를 만들지 않는다. */
const TICK_MS = 60_000;

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

/** 복무 진행률 막대와 읽기 쉬운 퍼센트. */
export function ServiceProgress(props: {
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  /** 오른쪽 아래에 덧붙일 설명(예: "다음 진급 12월 1일"). */
  caption: string;
}) {
  const styles = useStyles();
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

const useStyles = makeStyles(({ colors }) => ({
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
}));
