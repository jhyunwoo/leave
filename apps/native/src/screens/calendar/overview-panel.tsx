/**
 * 넓은 창의 달력 인스펙터에서 "아직 아무 날도 고르지 않았을 때" 보여줄 요약.
 *
 * 사용처: `screens/calendar/index.tsx` (medium·expanded 크기 클래스).
 *
 * 빈 흰 칸을 남기지 않으려고 아무거나 채우지 않는다. 여기 있는 다섯 가지는 모두
 * 달력 화면이 **이미 받아 둔 캐시**에서 나오고(추가 요청 없음), 계획을 세우기 전에
 * 실제로 확인하는 것들이다 — 오늘 상황, 내 잔여, 이번 정기외박 주기, 다음 일정,
 * 이번 달 붐비는 날. 붐비는 날 칩을 누르면 그대로 그 날짜가 선택돼 인스펙터가
 * 하루 상세로 바뀐다.
 */

import { availabilitySignal } from "@leave/shared/availability";
import {
  fmtDateK,
  fmtDateTiny,
  fmtRange,
  fmtRangeTiny,
} from "@leave/shared/calendar";
import { type ISODate } from "@leave/shared/dates";
import { getHoliday } from "@leave/shared/holidays";
import { type RegularOvernightCycle } from "@leave/shared/regular-overnight";
import { Pressable, Text, View } from "react-native";
import type { Calendar, LeaveHoldings, MyLeave } from "@leave/client";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { SegmentBadges } from "@/components/segment-badges";
import { makeStyles, radius, spacing } from "@/theme";

/** 요약에 올릴 붐비는 날 최대 개수. 더 늘리면 칩 줄이 패널을 지배한다. */
const CROWDED_LIMIT = 6;

export function CalendarOverviewPanel(props: {
  /** 이번 달 달력. 아직 못 받았으면 null — 그 자리만 비운다. */
  calendar: Calendar | null;
  today: ISODate;
  holdings: LeaveHoldings;
  leaves: MyLeave[];
  cycle: RegularOvernightCycle | null;
  cycleUsedDays: number;
  onSelectDate: (date: ISODate) => void;
  onOpenLeave: (leaveId: string) => void;
  onAddLeave: () => void;
}) {
  const styles = useStyles();
  const { calendar, today } = props;

  const todayStat = calendar?.days.find((day) => day.date === today) ?? null;
  const todaySignal = todayStat
    ? availabilitySignal(todayStat.count, todayStat.allowed)
    : null;
  const todayHoliday = getHoliday(today);

  // 아직 오지 않은 계획 중 가장 빠른 것. 초안도 내 계획이므로 함께 본다.
  const nextLeave = props.leaves
    .filter((leave) => leave.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  // 이번 달에서 앞으로 남은 날 중 초과·임박인 날. 계획을 피해 잡을 곳이다.
  const crowded = (calendar?.days ?? [])
    .filter((day) => day.date >= today)
    .map((day) => ({ day, signal: availabilitySignal(day.count, day.allowed) }))
    .filter(
      (entry) => entry.signal.key === "exceeded" || entry.signal.key === "near",
    )
    .slice(0, CROWDED_LIMIT);

  return (
    <View style={styles.root}>
      <ContentPanel style={styles.panel}>
        <Text style={styles.eyebrow} selectable>
          오늘
        </Text>
        <Text style={styles.headline} selectable>
          {fmtDateK(today)}
        </Text>
        {todayHoliday ? (
          <Text style={styles.holiday} selectable>
            {todayHoliday}
          </Text>
        ) : null}
        {todaySignal ? (
          <View style={styles.row}>
            <Badge
              text={
                todaySignal.percent == null
                  ? "기준 미설정"
                  : `${todaySignal.label} ${todaySignal.percent}%`
              }
              kind={todaySignal.key === "exceeded" ? "negative" : "positive"}
            />
          </View>
        ) : (
          <Text style={styles.caption} selectable>
            오늘의 출타 현황을 불러오는 중이에요.
          </Text>
        )}
        <Text style={styles.caption} selectable>
          날짜를 고르면 그날의 출타 명단과 제한 여부가 여기에 나와요.
        </Text>
      </ContentPanel>

      <ContentPanel tone="accent" style={styles.panel}>
        <Text style={styles.eyebrow} selectable>
          내 잔여
        </Text>
        <Text style={styles.headline} selectable>
          남은 휴가 {props.holdings.remaining}일
        </Text>
        <Text style={styles.caption} selectable>
          {props.holdings.planned > 0
            ? `이 중 계획 ${props.holdings.planned}일`
            : "아직 잡아 둔 계획이 없어요"}
          {props.holdings.expiringSoon > 0
            ? ` · 만료 임박 ${props.holdings.expiringSoon}일`
            : ""}
        </Text>
        {props.cycle ? (
          <Text style={styles.cycleLine} selectable>
            정기외박 {props.cycle.index}주기{" "}
            {fmtRangeTiny(props.cycle.start, props.cycle.end)} ·{" "}
            {props.cycle.grantDays}일 중 {props.cycleUsedDays}일 사용
          </Text>
        ) : null}
        <Button
          icon="calendarAdd"
          title="휴가 등록"
          onPress={props.onAddLeave}
        />
      </ContentPanel>

      <ContentPanel style={styles.panel}>
        <Text style={styles.sectionTitle} selectable>
          다음 일정
        </Text>
        {nextLeave ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${nextLeave.title} 자세히 보기`}
            onPress={() => props.onOpenLeave(nextLeave.id)}
            style={styles.nextLeave}
          >
            <Text style={styles.nextTitle} numberOfLines={1}>
              {nextLeave.title}
            </Text>
            <Text style={styles.caption}>
              {fmtRange(nextLeave.startDate, nextLeave.endDate)}
            </Text>
            <SegmentBadges segments={nextLeave.segments} />
          </Pressable>
        ) : (
          <Text style={styles.caption} selectable>
            앞으로 잡아 둔 휴가가 없어요.
          </Text>
        )}
      </ContentPanel>

      <ContentPanel style={styles.panel}>
        <Text style={styles.sectionTitle} selectable>
          이번 달 붐비는 날
        </Text>
        {crowded.length === 0 ? (
          <Text style={styles.caption} selectable>
            이번 달 남은 날짜 중 기준에 가까운 날이 없어요.
          </Text>
        ) : (
          <>
            <Text style={styles.caption} selectable>
              날짜를 누르면 그날 누가 나가는지 볼 수 있어요.
            </Text>
            <View style={styles.chipRow}>
              {crowded.map(({ day, signal }) => (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityLabel={`${fmtDateTiny(day.date)}, ${signal.label} ${signal.percent ?? 0}퍼센트. 이 날 상세 보기`}
                  onPress={() => props.onSelectDate(day.date)}
                  style={[
                    styles.chip,
                    signal.key === "exceeded" && styles.chipExceeded,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      signal.key === "exceeded" && styles.chipTextExceeded,
                    ]}
                  >
                    {fmtDateTiny(day.date)} · {signal.percent}%
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ContentPanel>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: spacing.lg },
  panel: { padding: spacing.lg, gap: spacing.sm },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: colors.brand,
  },
  headline: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  holiday: { fontSize: 13, fontWeight: "600", color: colors.negative },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  caption: { fontSize: 12, lineHeight: 18, color: colors.mute },
  cycleLine: { fontSize: 12, lineHeight: 18, color: colors.body },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  nextLeave: { gap: 4 },
  nextTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    minHeight: 32,
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceCard,
  },
  chipExceeded: { backgroundColor: colors.negativeTint },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.body },
  chipTextExceeded: { color: colors.negativeDeep },
}));
