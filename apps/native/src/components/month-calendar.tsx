import {
  buildMonthGrid,
  getHoliday,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Calendar } from "@/api/queries";
import { colors, radius, spacing } from "@/theme";

/** 부대 월 달력 그리드. 웹과 동일한 시각 언어(라임 선택, 빨간 초과일). */
export function MonthCalendar(props: {
  calendar: Calendar;
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
  compact?: boolean;
  /** 스크롤 달력처럼 요일 헤더를 위에서 한 번만 그릴 때 true. */
  hideWeekdays?: boolean;
}) {
  const { calendar, selectedDate, onSelectDate, compact, hideWeekdays } = props;
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

            return (
              <Pressable
                key={cell.date}
                disabled={!cell.inMonth}
                accessibilityRole="button"
                accessibilityLabel={
                  cell.inMonth
                    ? `${dayNum}일${holiday ? `, ${holiday}` : ""}, 휴가 ${stat?.count ?? 0}명${exceeded ? ", 출타율 초과" : ""}`
                    : undefined
                }
                onPress={() => onSelectDate(cell.date)}
                style={({ pressed }) => [
                  styles.cell,
                  { minHeight: cellHeight },
                  exceeded && { backgroundColor: colors.negativeTint },
                  isSelected && styles.cellSelected,
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                {cell.inMonth && (
                  <>
                    <View
                      style={[styles.dayNumWrap, isToday && styles.todayWrap]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          (sunday || holiday) && { color: colors.negative },
                          exceeded && { color: colors.negativeDeep },
                          isToday && { color: colors.onPrimary },
                          isSelected && { color: colors.ink },
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
                    {!compact && stat && stat.count > 0 && (
                      <View
                        style={[
                          styles.countPill,
                          exceeded && { backgroundColor: colors.negativeBg },
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
  cellSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
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
});
