import {
  buildMonthGrid,
  fmtDateK,
  shiftMonth,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/theme";

/**
 * 자체 인라인 날짜 선택기 — 네이티브 의존성 없이 모든 플랫폼에서 동일하게 동작.
 * 행을 탭하면 소형 월 그리드가 펼쳐진다.
 */
export function DatePickerRow(props: {
  label: string;
  value: ISODate | "";
  min?: ISODate;
  max?: ISODate;
  onChange: (date: ISODate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    (props.value || todayInSeoul()).slice(0, 7),
  );

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.label} 선택`}
        onPress={() => setOpen((o) => !o)}
        style={styles.row}
      >
        <Text style={styles.rowLabel}>{props.label}</Text>
        <Text style={[styles.rowValue, !props.value && { color: colors.mute }]}>
          {props.value ? fmtDateK(props.value) : "날짜 선택"}
        </Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          <View style={styles.monthNav}>
            <Pressable
              accessibilityLabel="이전 달"
              onPress={() => setMonth((m) => shiftMonth(m, -1))}
              style={styles.navBtn}
            >
              <Text style={styles.navBtnText}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>
              {month.slice(0, 4)}년 {Number(month.slice(5))}월
            </Text>
            <Pressable
              accessibilityLabel="다음 달"
              onPress={() => setMonth((m) => shiftMonth(m, 1))}
              style={styles.navBtn}
            >
              <Text style={styles.navBtnText}>›</Text>
            </Pressable>
          </View>
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
          {buildMonthGrid(month).map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((cell) => {
                const disabled =
                  !cell.inMonth ||
                  (props.min ? cell.date < props.min : false) ||
                  (props.max ? cell.date > props.max : false);
                const selected = cell.date === props.value;
                return (
                  <Pressable
                    key={cell.date}
                    disabled={disabled}
                    onPress={() => {
                      props.onChange(cell.date);
                      setOpen(false);
                    }}
                    style={[styles.day, selected && styles.daySelected]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        disabled && {
                          color: cell.inMonth ? "#c8cbc5" : "transparent",
                        },
                        selected && { color: colors.onPrimary },
                      ]}
                    >
                      {Number(cell.date.slice(8))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: "rgba(14, 15, 12, 0.35)",
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  rowLabel: { fontSize: 14, fontWeight: "600", color: colors.ink },
  rowValue: { fontSize: 15, color: colors.ink },
  panel: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  monthNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  monthTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnText: { fontSize: 20, color: colors.ink, lineHeight: 24 },
  weekRow: { flexDirection: "row" },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: colors.mute,
    paddingVertical: 4,
  },
  day: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  daySelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 14, color: colors.ink },
});
