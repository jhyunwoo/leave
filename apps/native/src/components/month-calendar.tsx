import {
  buildMonthGrid,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Calendar } from "@/api/queries";
import { colors, radius, spacing } from "@/theme";

/** 부대 월 달력 그리드. 웹과 동일한 시각 언어(라임 오늘 표시, 빨간 초과일). */
export function MonthCalendar(props: {
  calendar: Calendar;
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
  compact?: boolean;
}) {
  const { calendar, selectedDate, onSelectDate, compact } = props;
  const today = todayInSeoul();
  const weeks = useMemo(() => buildMonthGrid(calendar.month), [calendar.month]);
  const statByDate = useMemo(
    () => new Map(calendar.days.map((d) => [d.date, d])),
    [calendar.days],
  );

  const cellHeight = compact ? 44 : 72;

  return (
    <View accessibilityLabel={`${calendar.month} 부대 휴가 달력`}>
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
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell) => {
            const stat = cell.inMonth ? statByDate.get(cell.date) : undefined;
            const exceeded = stat?.exceeded ?? false;
            const isToday = cell.date === today;
            const isSelected = cell.date === selectedDate;
            const dayNum = Number(cell.date.slice(8));
            const sunday = new Date(cell.date).getUTCDay() === 0;

            return (
              <Pressable
                key={cell.date}
                disabled={!cell.inMonth}
                accessibilityRole="button"
                accessibilityLabel={
                  cell.inMonth
                    ? `${dayNum}일, 휴가 ${stat?.count ?? 0}명${exceeded ? ", 출타율 초과" : ""}`
                    : undefined
                }
                onPress={() => onSelectDate(cell.date)}
                style={[
                  styles.cell,
                  { minHeight: cellHeight },
                  exceeded && { backgroundColor: colors.negativeTint },
                  isSelected && styles.cellSelected,
                  isSelected && exceeded && { borderColor: colors.negativeDeep },
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
                          sunday && { color: colors.negative },
                          exceeded && { color: colors.negativeDeep },
                          isToday && { color: colors.onPrimary },
                        ]}
                      >
                        {dayNum}
                      </Text>
                    </View>
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
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  cellSelected: { borderColor: colors.ink },
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
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryPale,
  },
  countText: { fontSize: 11, fontWeight: "600", color: colors.inkDeep },
});
