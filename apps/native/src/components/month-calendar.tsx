import {
  BALANCE_LABELS,
  buildMonthGrid,
  getHoliday,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
  type RegularOvernightCycle,
} from "@leave/shared";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Calendar } from "@/api/queries";
import type { MyLeaveDay } from "@/lib/my-leave-days";
import { BALANCE_COLORS, colors, radius, spacing } from "@/theme";

/**
 * 주 행 위에 비워두는 주기 구분선 자리의 높이.
 * calendar-scroll의 고정 높이 계산이 이 값을 함께 쓴다.
 */
export const CYCLE_LANE_HEIGHT = 14;

/** 부대 월 달력 그리드. 웹과 동일한 시각 언어(라임 선택, 빨간 초과일). */
export function MonthCalendar(props: {
  calendar: Calendar;
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
  compact?: boolean;
  /** 스크롤 달력처럼 요일 헤더를 위에서 한 번만 그릴 때 true. */
  hideWeekdays?: boolean;
  /** 날짜 → 내 휴가 재원. 있으면 출타율 대신 재원 칩을 그린다. */
  myLeaveDays?: Map<ISODate, MyLeaveDay>;
  /** 이 달과 겹치는 정기외박 주기들. 경계에 구분선을 긋는다. */
  cycles?: RegularOvernightCycle[];
  /** 오늘이 속한 정기외박 주기. 해당 날짜 칸에 옅은 배경을 깐다. */
  currentCycle?: RegularOvernightCycle | null;
}) {
  const {
    calendar,
    selectedDate,
    onSelectDate,
    compact,
    hideWeekdays,
    myLeaveDays,
    cycles,
    currentCycle,
  } = props;
  const today = todayInSeoul();
  const weeks = useMemo(() => buildMonthGrid(calendar.month), [calendar.month]);
  const statByDate = useMemo(
    () => new Map(calendar.days.map((d) => [d.date, d])),
    [calendar.days],
  );
  // 주기가 시작하는 날 → 순번. 그 날이 있는 주 위에 구분선을 그린다.
  const cycleStarts = useMemo(
    () => new Map((cycles ?? []).map((cycle) => [cycle.start, cycle.index])),
    [cycles],
  );

  const cellHeight = compact ? 44 : 72;
  // 주기를 쓰는 동안에는 주 행마다 항상 같은 높이의 "구분선 자리"를 비워둬야
  // 무한 스크롤의 고정 높이 계산(calendar-scroll의 itemHeight)이 흐트러지지 않는다.
  const laneHeight = !compact && cycles?.length ? CYCLE_LANE_HEIGHT : 0;

  return (
    <View accessibilityLabel={`${calendar.month} 부대 휴가 달력`}>
      {!hideWeekdays && (
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text
              key={w}
              style={[styles.weekday, i === 0 && { color: colors.negative }]}
            >
              {w}
            </Text>
          ))}
        </View>
      )}
      {weeks.map((week, wi) => {
        const cycleStart = week.find(
          (cell) => cell.inMonth && cycleStarts.has(cell.date),
        );
        return (
          <View key={wi}>
            {laneHeight > 0 && (
              <View style={[styles.cycleLane, { height: laneHeight }]}>
                {cycleStart && (
                  <>
                    <View style={styles.cycleLine} />
                    <Text style={styles.cycleLabel}>
                      정기외박 {cycleStarts.get(cycleStart.date)}주기
                    </Text>
                    <View style={styles.cycleLine} />
                  </>
                )}
              </View>
            )}
            <View style={styles.weekRow}>
              {week.map((cell) => {
                const stat = cell.inMonth
                  ? statByDate.get(cell.date)
                  : undefined;
                const exceeded = stat?.exceeded ?? false;
                const isToday = cell.date === today;
                const isSelected = cell.date === selectedDate;
                const dayNum = Number(cell.date.slice(8));
                const sunday = new Date(cell.date).getUTCDay() === 0;
                const holiday = cell.inMonth ? getHoliday(cell.date) : null;
                const mine = cell.inMonth
                  ? myLeaveDays?.get(cell.date)
                  : undefined;
                const inCycle =
                  cell.inMonth &&
                  currentCycle != null &&
                  currentCycle.start <= cell.date &&
                  cell.date <= currentCycle.end;
                const tone = mine ? BALANCE_COLORS[mine.key] : null;

                return (
                  <Pressable
                    key={cell.date}
                    disabled={!cell.inMonth}
                    accessibilityRole="button"
                    accessibilityLabel={
                      cell.inMonth
                        ? `${dayNum}일${holiday ? `, ${holiday}` : ""}${
                            mine ? `, 내 ${BALANCE_LABELS[mine.key]}` : ""
                          }, 휴가 ${stat?.count ?? 0}명${
                            exceeded ? ", 최대 출타 인원 초과" : ""
                          }`
                        : undefined
                    }
                    onPress={() => onSelectDate(cell.date)}
                    style={({ pressed }) => [
                      styles.cell,
                      { minHeight: cellHeight },
                      inCycle && { backgroundColor: colors.cycleTint },
                      exceeded && { backgroundColor: colors.negativeTint },
                      pressed && { transform: [{ scale: 0.97 }] },
                    ]}
                  >
                    {cell.inMonth && (
                      <>
                        <View
                          style={[
                            styles.dayNumWrap,
                            isToday && styles.todayWrap,
                            isSelected && styles.selectedWrap,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayNum,
                              (sunday || holiday) && { color: colors.negative },
                              exceeded && { color: colors.negativeDeep },
                              (isToday || isSelected) && {
                                color: colors.onPrimary,
                              },
                            ]}
                          >
                            {dayNum}
                          </Text>
                        </View>
                        {!compact && holiday && (
                          <Text
                            style={styles.holiday}
                            numberOfLines={1}
                            ellipsizeMode="clip"
                          >
                            {holiday}
                          </Text>
                        )}
                        {/* 내 휴가가 있는 날은 재원 칩, 없으면 부대 출타율. */}
                        {!compact && mine && tone ? (
                          <View
                            style={[
                              styles.myChip,
                              { backgroundColor: tone.bg },
                              // 이어지는 날은 모서리를 붙여 한 덩어리로 보이게 한다.
                              !mine.isSegmentStart && styles.chipJoinLeft,
                              !mine.isSegmentEnd && styles.chipJoinRight,
                            ]}
                          >
                            {mine.isSegmentStart && (
                              <Text
                                style={[styles.myChipText, { color: tone.fg }]}
                                numberOfLines={1}
                                ellipsizeMode="clip"
                              >
                                {BALANCE_LABELS[mine.key]}
                              </Text>
                            )}
                          </View>
                        ) : (
                          !compact &&
                          stat &&
                          stat.count > 0 && (
                            <View
                              style={[
                                styles.countPill,
                                exceeded && {
                                  backgroundColor: colors.negativeBg,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.countText,
                                  exceeded && { color: "#fff" },
                                  isSelected && {
                                    color: exceeded
                                      ? colors.negativeDeep
                                      : colors.inkDeep,
                                  },
                                ]}
                              >
                                {stat.count}/{stat.allowed}
                              </Text>
                            </View>
                          )
                        )}
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  weekRow: { flexDirection: "row", gap: 2, marginBottom: 2 },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: colors.mute,
    paddingVertical: spacing.sm,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 6,
    gap: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  dayNumWrap: {
    minWidth: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  todayWrap: { backgroundColor: colors.primary },
  selectedWrap: { backgroundColor: colors.ink },
  dayNum: { fontSize: 14, fontWeight: "600", color: colors.ink },
  holiday: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.negative,
    maxWidth: "100%",
    paddingHorizontal: 2,
  },
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
  },
  countText: { fontSize: 11, fontWeight: "600", color: colors.inkDeep },
  myChip: {
    alignSelf: "stretch",
    marginHorizontal: 1,
    minHeight: 16,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  chipJoinLeft: {
    marginLeft: -2,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  chipJoinRight: {
    marginRight: -2,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  myChipText: { fontSize: 10, fontWeight: "700" },
  cycleLane: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cycleLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  cycleLabel: { fontSize: 9, fontWeight: "700", color: colors.mute },
});
