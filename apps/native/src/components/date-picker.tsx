/**
 * 날짜·기간 선택기.
 *
 * 사용처: 휴가 등록/수정 시트, 제한 기간 등록.
 *
 * 시스템 DatePicker를 쓰지 않는 이유는 기간 선택 때문이다. 시작일과 종료일을
 * 각각 고르게 하면 "언제부터 언제까지"가 한눈에 보이지 않는다. 달력 위에서
 * 두 번 눌러 구간을 칠하는 방식이라야 며칠짜리인지 즉시 이해된다.
 */

import {
  buildMonthGrid,
  fmtDateK,
  fmtDateShort,
  inclusiveDays,
  shiftMonth,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { makeStyles, radius, spacing, useColors } from "@/theme";

function initialMonth(value?: ISODate, min?: ISODate, max?: ISODate) {
  let month = (value || todayInSeoul()).slice(0, 7);
  if (min && month < min.slice(0, 7)) month = min.slice(0, 7);
  if (max && month > max.slice(0, 7)) month = max.slice(0, 7);
  return month;
}

function selectionFeedback() {
  if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
}

function CalendarPanel(props: {
  month: string;
  value: ISODate | "";
  min?: ISODate;
  max?: ISODate;
  rangeStart?: ISODate | "";
  rangeEnd?: ISODate | "";
  instruction?: string;
  onChangeMonth: (month: string) => void;
  onSelect: (date: ISODate) => void;
  testID?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const weeks = useMemo(() => buildMonthGrid(props.month), [props.month]);
  const previousMonth = shiftMonth(props.month, -1);
  const nextMonth = shiftMonth(props.month, 1);
  const previousDisabled = Boolean(
    props.min && previousMonth < props.min.slice(0, 7),
  );
  const nextDisabled = Boolean(props.max && nextMonth > props.max.slice(0, 7));
  const today = todayInSeoul();

  return (
    <View style={styles.calendar} testID={props.testID}>
      {props.instruction ? (
        <Text style={styles.instruction} accessibilityLiveRegion="polite">
          {props.instruction}
        </Text>
      ) : null}

      <View style={styles.monthNavigation}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 달"
          accessibilityState={{ disabled: previousDisabled }}
          disabled={previousDisabled}
          onPress={() => props.onChangeMonth(previousMonth)}
          style={({ pressed }) => [
            styles.monthButton,
            pressed && styles.pressed,
            previousDisabled && styles.navigationDisabled,
          ]}
        >
          <Text style={styles.monthButtonText}>‹</Text>
        </Pressable>

        <Text style={styles.monthTitle} selectable>
          {props.month.slice(0, 4)}년 {Number(props.month.slice(5))}월
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          accessibilityState={{ disabled: nextDisabled }}
          disabled={nextDisabled}
          onPress={() => props.onChangeMonth(nextMonth)}
          style={({ pressed }) => [
            styles.monthButton,
            pressed && styles.pressed,
            nextDisabled && styles.navigationDisabled,
          ]}
        >
          <Text style={styles.monthButtonText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((weekday, index) => (
          <Text
            key={weekday}
            style={[styles.weekday, index === 0 && { color: colors.negative }]}
          >
            {weekday}
          </Text>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week[0]?.date} style={styles.weekRow}>
          {week.map((cell) => {
            const disabled =
              !cell.inMonth ||
              Boolean(props.min && cell.date < props.min) ||
              Boolean(props.max && cell.date > props.max);
            const selected = cell.date === props.value;
            const rangeEdge =
              cell.date === props.rangeStart || cell.date === props.rangeEnd;
            const inRange = Boolean(
              props.rangeStart &&
              props.rangeEnd &&
              props.rangeStart <= cell.date &&
              cell.date <= props.rangeEnd,
            );
            const isToday = cell.date === today;

            return (
              <Pressable
                key={cell.date}
                accessible={cell.inMonth}
                accessibilityRole="button"
                accessibilityLabel={`${fmtDateK(cell.date)}${isToday ? ", 오늘" : ""}`}
                accessibilityState={{
                  disabled,
                  selected: selected || rangeEdge,
                }}
                disabled={disabled}
                onPress={() => {
                  selectionFeedback();
                  props.onSelect(cell.date);
                }}
                style={({ pressed }) => [
                  styles.day,
                  inRange && styles.dayInRange,
                  isToday && !selected && !rangeEdge && styles.dayToday,
                  (selected || rangeEdge) && styles.daySelected,
                  pressed && !disabled && styles.dayPressed,
                ]}
                testID={
                  props.testID ? `${props.testID}-day-${cell.date}` : undefined
                }
              >
                <Text
                  style={[
                    styles.dayText,
                    !cell.inMonth && styles.dayOutside,
                    disabled && cell.inMonth && styles.dayDisabled,
                    (selected || rangeEdge) && styles.dayTextSelected,
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
  );
}

/**
 * 화면 안에서 완전히 렌더링되는 자체 날짜 선택 행.
 * 네이티브 피커의 고유 너비에 의존하지 않아 좁은 시트에서도 잘리지 않는다.
 */
export function DatePickerRow(props: {
  label: string;
  value: ISODate | "";
  min?: ISODate;
  max?: ISODate;
  onChange: (date: ISODate) => void;
  testID?: string;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    initialMonth(props.value || undefined, props.min, props.max),
  );

  const toggle = () => {
    if (!open) {
      setMonth(initialMonth(props.value || undefined, props.min, props.max));
    }
    setOpen((current) => !current);
  };

  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.label}, ${props.value ? fmtDateK(props.value) : "날짜 선택"}`}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={({ pressed }) => [
          styles.dateRow,
          open && styles.dateRowActive,
          pressed && styles.pressed,
        ]}
        testID={props.testID}
      >
        <View style={styles.dateRowText}>
          <Text style={styles.dateLabel}>{props.label}</Text>
          <Text
            style={[styles.dateValue, !props.value && styles.placeholder]}
            numberOfLines={1}
          >
            {props.value ? fmtDateK(props.value) : "날짜 선택"}
          </Text>
        </View>
        <Text style={styles.changeLabel}>{open ? "접기" : "변경"}</Text>
      </Pressable>

      {open ? (
        <CalendarPanel
          month={month}
          value={props.value}
          min={props.min}
          max={props.max}
          onChangeMonth={setMonth}
          onSelect={(date) => {
            props.onChange(date);
            setOpen(false);
          }}
          testID={props.testID ? `${props.testID}-calendar` : undefined}
        />
      ) : null}
    </View>
  );
}

/**
 * 휴가 등록 전용 날짜 범위 입력. 달력은 하나만 열리고 시작일을 고르면
 * 종료일 선택으로 이어져, 작은 화면에서도 두 피커가 겹치지 않는다.
 */
export function DateRangePicker(props: {
  startDate: ISODate | "";
  endDate: ISODate | "";
  onChange: (startDate: ISODate, endDate: ISODate) => void;
  testID?: string;
}) {
  const styles = useStyles();
  const [active, setActive] = useState<"start" | "end" | null>(null);
  const [month, setMonth] = useState(() =>
    initialMonth(props.startDate || props.endDate || undefined),
  );
  const validRange = Boolean(
    props.startDate && props.endDate && props.startDate <= props.endDate,
  );
  const duration = validRange
    ? inclusiveDays(props.startDate, props.endDate)
    : 0;

  const openField = (field: "start" | "end") => {
    if (field === "end" && !props.startDate) return;
    if (active === field) {
      setActive(null);
      return;
    }
    const value = field === "start" ? props.startDate : props.endDate;
    setMonth(initialMonth(value || props.startDate || undefined));
    setActive(field);
  };

  return (
    <View style={styles.rangeField} testID={props.testID}>
      <View style={styles.rangeHeader}>
        <Text style={styles.rangeTitle}>휴가 기간</Text>
        {duration > 0 ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{duration}일</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.rangeInputs}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`시작일, ${props.startDate ? fmtDateK(props.startDate) : "날짜 선택"}`}
          accessibilityState={{ expanded: active === "start" }}
          onPress={() => openField("start")}
          style={({ pressed }) => [
            styles.rangeInput,
            active === "start" && styles.rangeInputActive,
            pressed && styles.pressed,
          ]}
          testID={props.testID ? `${props.testID}-start` : undefined}
        >
          <Text style={styles.rangeInputLabel}>시작일</Text>
          <Text
            style={[
              styles.rangeInputValue,
              !props.startDate && styles.placeholder,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {props.startDate ? fmtDateShort(props.startDate) : "날짜 선택"}
          </Text>
          {props.startDate ? (
            <Text style={styles.rangeInputYear}>
              {props.startDate.slice(0, 4)}년
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`종료일, ${props.endDate ? fmtDateK(props.endDate) : "날짜 선택"}`}
          accessibilityHint={
            props.startDate ? undefined : "시작일을 먼저 선택해주세요"
          }
          accessibilityState={{
            disabled: !props.startDate,
            expanded: active === "end",
          }}
          disabled={!props.startDate}
          onPress={() => openField("end")}
          style={({ pressed }) => [
            styles.rangeInput,
            active === "end" && styles.rangeInputActive,
            !props.startDate && styles.rangeInputDisabled,
            pressed && styles.pressed,
          ]}
          testID={props.testID ? `${props.testID}-end` : undefined}
        >
          <Text style={styles.rangeInputLabel}>종료일</Text>
          <Text
            style={[
              styles.rangeInputValue,
              !props.endDate && styles.placeholder,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {props.endDate ? fmtDateShort(props.endDate) : "날짜 선택"}
          </Text>
          {props.endDate ? (
            <Text style={styles.rangeInputYear}>
              {props.endDate.slice(0, 4)}년
            </Text>
          ) : null}
        </Pressable>
      </View>

      {active ? (
        <CalendarPanel
          month={month}
          value={active === "start" ? props.startDate : props.endDate}
          min={active === "end" ? props.startDate || undefined : undefined}
          rangeStart={props.startDate}
          rangeEnd={props.endDate}
          instruction={
            active === "start"
              ? "휴가가 시작하는 날을 선택해주세요."
              : "마지막 휴가 날짜를 선택해주세요."
          }
          onChangeMonth={setMonth}
          onSelect={(date) => {
            if (active === "start") {
              const nextEnd =
                !props.endDate || props.endDate < date ? date : props.endDate;
              props.onChange(date, nextEnd);
              setMonth(date.slice(0, 7));
              setActive("end");
              return;
            }
            props.onChange(props.startDate || date, date);
            setActive(null);
          }}
          testID={props.testID ? `${props.testID}-calendar` : undefined}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  field: { gap: spacing.sm, width: "100%" },
  dateRow: {
    minHeight: 58,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceCard,
  },
  dateRowActive: { borderColor: colors.brand, borderWidth: 2 },
  dateRowText: { flex: 1, minWidth: 0, gap: 2 },
  dateLabel: { fontSize: 12, fontWeight: "600", color: colors.body },
  dateValue: { fontSize: 16, fontWeight: "600", color: colors.ink },
  placeholder: { color: colors.mute },
  changeLabel: { fontSize: 13, fontWeight: "700", color: colors.brand },
  pressed: { opacity: 0.72 },
  rangeField: { width: "100%", gap: spacing.sm },
  rangeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  rangeTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  durationBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryPale,
  },
  durationText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkDeep,
    fontVariant: ["tabular-nums"],
  },
  rangeInputs: { flexDirection: "row", gap: spacing.sm, width: "100%" },
  rangeInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 82,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceCard,
  },
  rangeInputActive: { borderColor: colors.brand, borderWidth: 2 },
  rangeInputDisabled: { opacity: 0.55 },
  rangeInputLabel: { fontSize: 12, fontWeight: "600", color: colors.body },
  rangeInputValue: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    minWidth: 0,
  },
  rangeInputYear: {
    fontSize: 11,
    color: colors.mute,
    fontVariant: ["tabular-nums"],
  },
  calendar: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    overflow: "hidden",
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
  instruction: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand,
  },
  monthNavigation: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    // canvasSoft는 다크에서 순검정이라 canvas 패널 위에 구멍처럼 보인다.
    // 한 단 위의 표면을 써서 두 스킴 모두에서 버튼으로 읽히게 한다.
    backgroundColor: colors.surfaceCard,
  },
  navigationDisabled: { opacity: 0.28 },
  monthButtonText: { fontSize: 26, lineHeight: 30, color: colors.ink },
  monthTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  weekRow: { flexDirection: "row", width: "100%" },
  weekday: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.xs,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: colors.mute,
  },
  day: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  dayInRange: { backgroundColor: colors.primaryPale },
  dayToday: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brand,
  },
  daySelected: { backgroundColor: colors.primary },
  dayPressed: { opacity: 0.72 },
  dayText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  dayTextSelected: { color: colors.onPrimary, fontWeight: "800" },
  dayDisabled: { color: colors.mutedSoft },
  dayOutside: { color: "transparent" },
}));
