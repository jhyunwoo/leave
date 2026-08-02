import {
  BALANCE_LABELS,
  buildMonthGrid,
  cycleColor,
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
  /** 이 달과 겹치는 정기외박 주기들. 각 날짜 아래에 주기별 색 선을 깐다. */
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
  const cellHeight = compact ? 44 : 72;

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
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell) => {
            const stat = cell.inMonth ? statByDate.get(cell.date) : undefined;
            const exceeded = stat?.exceeded ?? false;
            const isToday = cell.date === today;
            const isSelected = cell.date === selectedDate;
            const dayNum = Number(cell.date.slice(8));
            const sunday = new Date(cell.date).getUTCDay() === 0;
            const holiday = cell.inMonth ? getHoliday(cell.date) : null;
            const mine = cell.inMonth ? myLeaveDays?.get(cell.date) : undefined;
            const inCycle =
              cell.inMonth &&
              currentCycle != null &&
              currentCycle.start <= cell.date &&
              cell.date <= currentCycle.end;
            const tone = mine ? BALANCE_COLORS[mine.key] : null;
            // 이 날이 속한 정기외박 주기. 칸 아래 얇은 색 선으로 표시한다.
            const cycle = cell.inMonth
              ? cycles?.find((c) => c.start <= cell.date && cell.date <= c.end)
              : undefined;

            return (
              <Pressable
                key={cell.date}
                disabled={!cell.inMonth}
                accessibilityRole="button"
                accessibilityLabel={
                  cell.inMonth
                    ? `${dayNum}일${holiday ? `, ${holiday}` : ""}${
                        cycle ? `, 정기외박 ${cycle.index}주기` : ""
                      }${mine ? `, 내 ${BALANCE_LABELS[mine.key]}` : ""}, 휴가 ${
                        stat?.count ?? 0
                      }명${exceeded ? ", 최대 출타 인원 초과" : ""}`
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
                    {/* 주기 표시선 — 같은 주기는 같은 색으로 이어져 한 줄처럼 보인다. */}
                    {cycle && (
                      <View
                        style={[
                          styles.cycleBar,
                          { backgroundColor: cycleColor(cycle.index) },
                          cell.date === cycle.start && styles.cycleBarStart,
                          cell.date === cycle.end && styles.cycleBarEnd,
                        ]}
                      />
                    )}
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
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
  cycleBar: {
    alignSelf: "stretch",
    // 칸 사이 간격(2)만큼 밖으로 빼 같은 주기의 날들이 끊기지 않게 잇는다.
    marginHorizontal: -2,
    marginTop: "auto",
    marginBottom: 4,
    height: 3,
  },
  cycleBarStart: {
    marginLeft: 2,
    borderTopLeftRadius: radius.pill,
    borderBottomLeftRadius: radius.pill,
  },
  cycleBarEnd: {
    marginRight: 2,
    borderTopRightRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
  },
});
