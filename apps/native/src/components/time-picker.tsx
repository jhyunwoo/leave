/**
 * 시각 선택 행(네이티브).
 *
 * 사용처: leave-form-modal(복귀 시간), personal-event-form·unit-event-form(시작·종료 시간).
 *
 * 예전에는 `"21:00"`을 키보드로 적게 했다. 숫자 자판을 열고 콜론을 찾아 다섯 자를
 * 치는 동안 틀릴 자리가 많고, 틀리면 저장을 눌러야 알 수 있었다. 고를 수 있는
 * 값만 늘어놓으면 잘못 적을 방법이 없다.
 *
 * 생김새는 `date-picker.tsx`의 `DatePickerRow`를 따른다 — 한 줄을 눌러 아래로
 * 펼치는 같은 몸짓이다. 네이티브 휠 피커를 쓰지 않는 이유도 그쪽과 같다: 좁은
 * 시트에서 고유 너비에 눌려 잘린다.
 *
 * 분은 5분 눈금만 늘어놓는다. 저장된 값이 눈금 밖이면(예전에 손으로 적은 값)
 * 그 값만 목록에 끼워 넣는다 — 목록에 없다고 다른 값이 골라진 것처럼 보이면,
 * 저장하는 순간 사용자가 모르는 시각이 덮인다.
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { makeStyles, radius, spacing } from "@/theme";

/** 분 눈금. */
const MINUTE_STEP = 5;

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  hour.toString().padStart(2, "0"),
);

function minuteOptions(current: string): string[] {
  const steps = Array.from({ length: 60 / MINUTE_STEP }, (_, index) =>
    (index * MINUTE_STEP).toString().padStart(2, "0"),
  );
  if (current && !steps.includes(current)) return [...steps, current].sort();
  return steps;
}

export function TimePickerRow(props: {
  label: string;
  /** "HH:MM", 또는 아직 정하지 않았으면 빈 문자열. */
  value: string;
  onChange: (value: string) => void;
  /** 비울 수 있는 시각인가. 개인·부대 일정의 시작·종료 시간이 그렇다. */
  optional?: boolean;
  /** 한 번에 고르는 자주 쓰는 시각. */
  presets?: readonly string[];
  testID?: string;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [hour = "", minute = ""] = props.value ? props.value.split(":") : [];

  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.label}, ${props.value || "지정 안 함"}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [
          styles.row,
          open && styles.rowActive,
          pressed && styles.pressed,
        ]}
        testID={props.testID}
      >
        <View style={styles.rowText}>
          <Text style={styles.label}>{props.label}</Text>
          <Text
            style={[styles.value, !props.value && styles.placeholder]}
            numberOfLines={1}
          >
            {props.value || "지정 안 함"}
          </Text>
        </View>
        <Text style={styles.change}>{open ? "접기" : "변경"}</Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          {props.presets?.length ? (
            <View style={styles.presets}>
              {props.presets.map((preset) => (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  accessibilityState={{ selected: props.value === preset }}
                  onPress={() => {
                    props.onChange(preset);
                    // 자주 쓰는 값을 눌렀으면 고를 것이 남지 않는다.
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    props.value === preset && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={
                    props.testID
                      ? `${props.testID}-preset-${preset}`
                      : undefined
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      props.value === preset && styles.chipTextSelected,
                    ]}
                  >
                    {preset}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.groupLabel}>시</Text>
          <View style={styles.grid}>
            {HOURS.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={`${Number(option)}시`}
                accessibilityState={{ selected: hour === option }}
                // 분까지 고르게 하지 않는다 — 정시가 가장 흔하다.
                onPress={() => props.onChange(`${option}:${minute || "00"}`)}
                style={({ pressed }) => [
                  styles.cell,
                  hour === option && styles.cellSelected,
                  pressed && styles.pressed,
                ]}
                testID={
                  props.testID ? `${props.testID}-hour-${option}` : undefined
                }
              >
                <Text
                  style={[
                    styles.cellText,
                    hour === option && styles.cellTextSelected,
                  ]}
                >
                  {Number(option)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.groupLabel}>분</Text>
          <View style={styles.grid}>
            {minuteOptions(minute).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={`${Number(option)}분`}
                accessibilityState={{ selected: minute === option }}
                onPress={() => {
                  props.onChange(`${hour || "00"}:${option}`);
                  // 분이 마지막 단계다. 여기서 접어야 저장 버튼이 곧바로 보인다.
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.cell,
                  minute === option && styles.cellSelected,
                  pressed && styles.pressed,
                ]}
                testID={
                  props.testID ? `${props.testID}-minute-${option}` : undefined
                }
              >
                <Text
                  style={[
                    styles.cellText,
                    minute === option && styles.cellTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          {props.optional && props.value ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                props.onChange("");
                setOpen(false);
              }}
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
              testID={props.testID ? `${props.testID}-clear` : undefined}
            >
              <Text style={styles.clearText}>시간 지우기</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  field: { gap: spacing.sm, width: "100%" },
  row: {
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
  rowActive: { borderColor: colors.brand, borderWidth: 2 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 12, fontWeight: "600", color: colors.body },
  value: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  placeholder: { color: colors.mute },
  change: { fontSize: 13, fontWeight: "700", color: colors.brand },
  pressed: { opacity: 0.72 },
  panel: {
    width: "100%",
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceCard,
  },
  chipSelected: { borderColor: colors.brand, backgroundColor: colors.primary },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.body,
    fontVariant: ["tabular-nums"],
  },
  chipTextSelected: { color: colors.onPrimary },
  groupLabel: {
    paddingHorizontal: spacing.xs,
    fontSize: 12,
    fontWeight: "700",
    color: colors.mute,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  /**
   * 한 줄에 여섯 칸.
   *
   * `flex: 1`을 주면 wrap이 먹지 않는다 — 기준 폭이 0이라 24개가 한 줄에 다
   * 들어가려 든다. 폭을 15%로 고정하면 여섯 칸(90%)에 칸 사이 여백 다섯이 얹혀도
   * 시트 폭 280~440px 어디서든 일곱 번째가 들어갈 자리가 없어 줄이 규칙적으로
   * 끊긴다. 24와 12 모두 6의 배수라 마지막 줄도 비지 않는다.
   */
  cell: {
    width: "15%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surfaceCard,
  },
  cellSelected: { backgroundColor: colors.primary },
  cellText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  cellTextSelected: { color: colors.onPrimary, fontWeight: "800" },
  clear: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  clearText: { fontSize: 13, fontWeight: "600", color: colors.mute },
}));
