/**
 * 시각 선택 행(iOS·Android) — OS가 주는 시각 피커를 그 자리에 펼친다.
 *
 * 사용처: leave-form-modal(복귀 시간), personal-event-form·unit-event-form(시작·종료 시간).
 *
 * 예전에는 시·분을 각각 격자에서 눌러 골랐다. 잘못 적을 방법이 없다는 장점은 그대로
 * 가져가면서, 손에 익은 시스템 몸짓(iOS 휠, Android 시계판)으로 바꾼 자리다.
 * 격자 구현은 expo-web용 대체본으로 `time-picker.tsx`에 남아 있다 — `@expo/ui`의
 * `DateTimePicker`는 웹에서 아무것도 그리지 않는다.
 *
 * 접었다 펴는 줄의 생김새는 `date-picker.tsx`의 `DatePickerRow`를 따른다. 폼 안에서
 * 언제나 펼쳐 두면 시작·종료 두 개만으로 화면이 다 찬다.
 */

import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { dateToTime, timeToDate } from "./time-value";
import {
  makeStyles,
  radius,
  spacing,
  useAppColorScheme,
  useColors,
} from "@/theme";

/** 값이 없는 채로 펼쳤을 때 피커가 가리킬 시각. */
const DEFAULT_TIME = "09:00";

/**
 * `display`는 플랫폼마다 다른 것을 뜻한다. iOS의 `"spinner"`는 휠이지만,
 * Android의 `"spinner"`는 시계판이 아니라 키보드 입력 칸이다(Material 3에는 휠이 없다).
 */
const PICKER_DISPLAY = Platform.OS === "ios" ? "spinner" : "default";

/**
 * iOS 휠은 기기의 12/24시간 설정을 따라간다. 이 앱은 어디서나 24시간으로 적으므로
 * (휴가 상세의 "복귀 예정 21:00", 알림 목록), 12시간 기기에서는 휠만 "오후 9:00"이
 * 되어 바로 위의 줄과 말이 갈린다. 24시간을 쓰는 로케일을 지정해 고정한다 — 시·분만
 * 도는 휠이라 이 로케일의 낱말이 보일 자리는 없다. Android는 `is24Hour`가 같은 일을 한다.
 */
const FORCE_24_HOUR_LOCALE = "en_GB";

export function TimePickerRow(props: {
  label: string;
  /** "HH:MM", 또는 아직 정하지 않았으면 빈 문자열. */
  value: string;
  onChange: (value: string) => void;
  /** 비울 수 있는 시각인가. 개인·부대 일정의 시작·종료 시간이 그렇다. */
  optional?: boolean;
  /** 한 번에 고르는 자주 쓰는 시각. */
  presets?: readonly string[];
  /** 값이 없는 채로 펼쳤을 때 시작할 시각. */
  defaultTime?: string;
  testID?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const colorScheme = useAppColorScheme();
  const [open, setOpen] = useState(false);
  const fallback = props.defaultTime || DEFAULT_TIME;

  /**
   * 피커는 언제나 무언가를 가리킨다. 값이 빈 채로 펼치면 줄은 "지정 안 함"인데 휠은
   * 9시를 보여주는 상태가 남으므로, 펼치는 순간 그 시각을 값으로 확정한다.
   */
  const toggle = () => {
    // 값 확정은 updater 밖에서 한다 — updater는 렌더 중에 돌아, 안에서 부모의
    // state를 건드리면 "다른 컴포넌트를 렌더하는 중에 갱신했다"는 경고가 난다.
    if (!open && !props.value) props.onChange(fallback);
    setOpen(!open);
  };

  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.label}, ${props.value || "지정 안 함"}`}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
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

          {/*
            폭을 밖에서 정해 준다. 그러지 않으면 SwiftUI 휠이 자기 고유 너비대로
            자리를 잡아, 폭이 좁은 formSheet 안에서 양끝이 잘린다.
          */}
          <DateTimePicker
            mode="time"
            display={PICKER_DISPLAY}
            presentation="inline"
            is24Hour
            locale={FORCE_24_HOUR_LOCALE}
            themeVariant={colorScheme}
            accentColor={colors.brand}
            value={timeToDate(props.value, fallback)}
            onValueChange={(_event, date) => props.onChange(dateToTime(date))}
            style={styles.picker}
            testID={props.testID ? `${props.testID}-picker` : undefined}
          />

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
  picker: { width: "100%" },
  clear: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  clearText: { fontSize: 13, fontWeight: "600", color: colors.mute },
}));
